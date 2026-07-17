import { Task, ITask, TaskStatus } from "../models/task.model";
import { TaskEvent } from "../models/taskEvent.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { emitProjectEvent } from "../sockets/project.socket";

/**
 * NOTE ON TRANSACTIONS:
 * This service runs against a standalone MongoDB instance (Docker single-node).
 * Standalone MongoDB does NOT support multi-document transactions or replica-set sessions.
 * All write pairs (read model + event log) use sequential writes with manual
 * compensation rollback on failure instead of session.withTransaction().
 */

// ─── Pagination Types ─────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedTasks {
  tasks: ITask[];
  pagination: PaginationMeta;
}

export interface GetTasksQuery {
  page: number;
  limit: number;
  status?: TaskStatus;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class TaskService {
  /**
   * Creates a new task inside the given project workspace.
   *
   * Write order:
   *   1. Insert Task read model
   *   2. Insert TaskEvent log entry
   *      → On failure: compensate by deleting the task that was just created
   *
   * Emits: `task:created` to the project room upon success.
   */
  public static async createTask(
    projectId: string,
    title: string,
    actorId: string,
    description?: string,
    assigneeId?: string,
    status: TaskStatus = "todo"
  ): Promise<ITask> {
    // 1. Insert the task read model
    const task = new Task({ projectId, title, description, assigneeId, status });
    const savedTask = await task.save();

    // 2. Append immutable creation event — compensate on failure
    try {
      await TaskEvent.create({
        taskId: savedTask.taskId,
        projectId,
        userId: actorId,
        eventType: "TASK_CREATED",
        payload: {
          title: savedTask.title,
          description: savedTask.description ?? null,
          assigneeId: savedTask.assigneeId ?? null,
          status: savedTask.status,
          projectId,
        },
      });
    } catch (eventErr) {
      // Compensate: remove the task so the DB stays consistent
      await Task.deleteOne({ taskId: savedTask.taskId }).catch(() => {});
      throw new ApiError(500, "Failed to record task creation event. Task rolled back.");
    }

    // 3. Real-time broadcast to all project room members
    emitProjectEvent(projectId, "task:created", {
      taskId: savedTask.taskId,
      projectId,
      title: savedTask.title,
      description: savedTask.description ?? null,
      assigneeId: savedTask.assigneeId ?? null,
      status: savedTask.status,
      createdAt: savedTask.createdAt,
    });

    return savedTask;
  }

  /**
   * Retrieves all non-deleted tasks for a project with cursor-based pagination.
   * Supports optional status column filtering for Kanban-style boards.
   *
   * Read-only — no writes performed.
   */
  public static async getProjectTasks(
    projectId: string,
    query: GetTasksQuery
  ): Promise<PaginatedTasks> {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    // Build filter — always exclude soft-deleted tasks
    const filter: Record<string, any> = { projectId, isDeleted: false };
    if (status) {
      filter.status = status;
    }

    // Run count and data queries in parallel for efficiency
    const [total, tasks] = await Promise.all([
      Task.countDocuments(filter),
      Task.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return {
      tasks: tasks as unknown as ITask[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Transitions a task's status using an event-sourced two-step pattern:
   *   1. Read current state — capture originalStatus for the event payload diff.
   *   2. Write STATUS_CHANGED event to the immutable log.
   *   3. Update the task read model atomically.
   *      → On event write failure: skip read model update and throw.
   *      → On read model update failure: compensate by deleting the event just written.
   *
   * Emits: `task:status_changed` to the project room upon success.
   */
  public static async updateTaskStatus(
    taskId: string,
    projectId: string,
    newStatus: TaskStatus,
    actorId: string
  ): Promise<ITask> {
    // Pre-flight: verify task exists and belongs to this project
    const existingTask = await Task.findOne({ taskId, projectId, isDeleted: false });
    if (!existingTask) {
      throw new ApiError(404, "Task not found or has been deleted");
    }

    const previousStatus = existingTask.status;

    // Guard: reject no-op status transitions
    if (previousStatus === newStatus) {
      throw new ApiError(400, `Task is already in '${newStatus}' status`);
    }

    // 1. Write the immutable STATUS_CHANGED event first — captures the full diff
    const eventDoc = await TaskEvent.create({
      taskId,
      projectId,
      userId: actorId,
      eventType: "STATUS_CHANGED",
      payload: { previousStatus, newStatus },
    });

    // 2. Update the read model — compensate on failure
    let updatedTask: ITask | null;
    try {
      updatedTask = await Task.findOneAndUpdate(
        { taskId, projectId, isDeleted: false },
        { $set: { status: newStatus } },
        { new: true }
      );

      if (!updatedTask) {
        throw new Error("Task document disappeared during update");
      }
    } catch (updateErr) {
      // Compensate: remove the event so the log stays consistent
      await TaskEvent.deleteOne({ _id: eventDoc._id }).catch(() => {});
      throw new ApiError(500, "Failed to update task status. Event rolled back.");
    }

    // 3. Real-time broadcast
    emitProjectEvent(projectId, "task:status_changed", {
      taskId,
      projectId,
      previousStatus,
      newStatus,
      updatedAt: updatedTask.updatedAt,
      actorId,
    });

    return updatedTask;
  }

  /**
   * Soft-deletes a task by flipping isDeleted to true.
   * Physical deletion is never performed — the record remains for audit purposes.
   *
   * Write order:
   *   1. Flip isDeleted on the read model.
   *   2. Append TASK_DELETED event to the immutable log.
   *      → On event write failure: compensate by reverting isDeleted to false.
   *
   * Emits: `task:deleted` to the project room upon success.
   */
  public static async softDeleteTask(
    taskId: string,
    projectId: string,
    actorId: string
  ): Promise<{ success: boolean }> {
    // Pre-flight: verify task exists and is within scope
    const existingTask = await Task.findOne({ taskId, projectId, isDeleted: false });
    if (!existingTask) {
      throw new ApiError(404, "Task not found or has already been deleted");
    }

    // 1. Flip isDeleted on the read model
    await Task.updateOne({ taskId, projectId }, { $set: { isDeleted: true } });

    // 2. Write the TASK_DELETED event — compensate on failure
    try {
      await TaskEvent.create({
        taskId,
        projectId,
        userId: actorId,
        eventType: "TASK_DELETED",
        payload: {
          taskId,
          title: existingTask.title,
        },
      });
    } catch (eventErr) {
      // Compensate: revert the soft-delete so the task is visible again
      await Task.updateOne({ taskId, projectId }, { $set: { isDeleted: false } }).catch(() => {});
      throw new ApiError(500, "Failed to record deletion event. Task restore attempted.");
    }

    // 3. Real-time broadcast
    emitProjectEvent(projectId, "task:deleted", {
      taskId,
      projectId,
      actorId,
    });

    return { success: true };
  }

  /**
   * Retrieves the full chronological event history for a single task.
   * Enriches each event record with the actor's profile (name, username, email).
   */
  public static async getTaskEvents(
    taskId: string,
    projectId: string
  ): Promise<any[]> {
    const task = await Task.findOne({ taskId, projectId });
    if (!task) {
      throw new ApiError(404, "Task not found in this project");
    }

    const events = await TaskEvent.find({ taskId })
      .sort({ timestamp: 1 })
      .lean();

    const actorIds = [...new Set(events.map((e) => e.userId))];
    const users = await User.find({ "uuid.id": { $in: actorIds } }).lean();
    const userMap = new Map<string, { name: string; username: string; email: string }>();
    for (const u of users) {
      userMap.set(u.uuid.id, { name: u.name, username: u.username, email: u.email });
    }

    return events.map((e) => ({
      ...e,
      actor: userMap.get(e.userId) ?? {
        name: "Unknown User",
        username: "unknown",
        email: "",
      },
    }));
  }

  /**
   * Retrieves all task events scoped to an entire project — across every task.
   * Sorted chronologically. Useful for a project-level task activity feed.
   */
  public static async getProjectTaskEvents(projectId: string): Promise<any[]> {
    const events = await TaskEvent.find({ projectId })
      .sort({ timestamp: 1 })
      .lean();

    const actorIds = [...new Set(events.map((e) => e.userId))];
    const users = await User.find({ "uuid.id": { $in: actorIds } }).lean();
    const userMap = new Map<string, { name: string; username: string; email: string }>();
    for (const u of users) {
      userMap.set(u.uuid.id, { name: u.name, username: u.username, email: u.email });
    }

    return events.map((e) => ({
      ...e,
      actor: userMap.get(e.userId) ?? {
        name: "Unknown User",
        username: "unknown",
        email: "",
      },
    }));
  }
}

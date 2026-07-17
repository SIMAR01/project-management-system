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
   * Helper to enrich tasks with their assignee's profile details.
   */
  public static async enrichTasks(tasks: any[]): Promise<any[]> {
    if (tasks.length === 0) return [];

    const assigneeIds = new Set<string>();
    for (const t of tasks) {
      if (t.assigneeId) assigneeIds.add(t.assigneeId);
    }

    const users = await User.find({ "uuid.id": { $in: Array.from(assigneeIds) } }).lean();
    const userMap = new Map<string, any>();
    for (const u of users) {
      userMap.set(u.uuid.id, u);
    }

    return tasks.map((t) => {
      const tObj = typeof t.toObject === "function" ? t.toObject() : t;
      const assigneeUser = tObj.assigneeId ? userMap.get(tObj.assigneeId) : null;
      return {
        ...tObj,
        assignee: assigneeUser
          ? {
              name: assigneeUser.name,
              username: assigneeUser.username,
              email: assigneeUser.email,
            }
          : null,
      };
    });
  }

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

    const enriched = await TaskService.enrichTasks([savedTask]);
    const enrichedTask = enriched[0];

    // 3. Real-time broadcast to all project room members
    emitProjectEvent(projectId, "task:created", enrichedTask);

    return enrichedTask;
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

    const enrichedTasks = await TaskService.enrichTasks(tasks);

    return {
      tasks: enrichedTasks as unknown as ITask[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Updates any details of a task (title, description, assigneeId, status).
   * Writes corresponding events to the immutable event log and handles rollbacks on failure.
   *
   * Emits: `task:updated` (and `task:status_changed` if status changed) to the project room.
   */
  public static async updateTask(
    taskId: string,
    projectId: string,
    updates: {
      title?: string;
      description?: string | null;
      assigneeId?: string | null;
      status?: TaskStatus;
    },
    actorId: string
  ): Promise<ITask> {
    // Pre-flight: verify task exists and belongs to this project
    const existingTask = await Task.findOne({ taskId, projectId, isDeleted: false });
    if (!existingTask) {
      throw new ApiError(404, "Task not found or has been deleted");
    }

    const eventsToCreate: any[] = [];
    const fieldsToUpdate: Record<string, any> = {};

    // 1. Check title update
    if (updates.title !== undefined && updates.title !== existingTask.title) {
      fieldsToUpdate.title = updates.title;
      eventsToCreate.push({
        taskId,
        projectId,
        userId: actorId,
        eventType: "TASK_UPDATED",
        payload: { field: "title", previousValue: existingTask.title, newValue: updates.title, title: existingTask.title },
      });
    }

    // 2. Check description update
    const previousDesc = existingTask.description || null;
    const newDesc = updates.description === undefined ? undefined : (updates.description || null);
    if (newDesc !== undefined && newDesc !== previousDesc) {
      fieldsToUpdate.description = newDesc;
      eventsToCreate.push({
        taskId,
        projectId,
        userId: actorId,
        eventType: "TASK_UPDATED",
        payload: { field: "description", previousValue: previousDesc, newValue: newDesc, title: existingTask.title },
      });
    }

    // 3. Check assignee update
    const previousAssignee = existingTask.assigneeId || null;
    const newAssignee = updates.assigneeId === undefined ? undefined : (updates.assigneeId || null);
    if (newAssignee !== undefined && newAssignee !== previousAssignee) {
      fieldsToUpdate.assigneeId = newAssignee;
      eventsToCreate.push({
        taskId,
        projectId,
        userId: actorId,
        eventType: "ASSIGNEE_CHANGED",
        payload: { previousAssigneeId: previousAssignee, newAssigneeId: newAssignee, title: existingTask.title },
      });
    }

    // 4. Check status update
    if (updates.status !== undefined && updates.status !== existingTask.status) {
      fieldsToUpdate.status = updates.status;
      eventsToCreate.push({
        taskId,
        projectId,
        userId: actorId,
        eventType: "STATUS_CHANGED",
        payload: { previousStatus: existingTask.status, newStatus: updates.status, title: existingTask.title },
      });
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      const enriched = await TaskService.enrichTasks([existingTask]);
      return enriched[0];
    }

    // Write events
    const createdEvents = await TaskEvent.insertMany(eventsToCreate);

    // Update read model
    let updatedTask: ITask | null;
    try {
      updatedTask = await Task.findOneAndUpdate(
        { taskId, projectId, isDeleted: false },
        { $set: fieldsToUpdate },
        { new: true }
      );

      if (!updatedTask) {
        throw new Error("Task document disappeared during update");
      }
    } catch (updateErr) {
      // Compensate: remove the events just written
      const eventIds = createdEvents.map((e) => e._id);
      await TaskEvent.deleteMany({ _id: { $in: eventIds } }).catch(() => {});
      throw new ApiError(500, "Failed to update task. Events rolled back.");
    }

    const enriched = await TaskService.enrichTasks([updatedTask]);
    const enrichedTask = enriched[0];

    // Real-time broadcast
    if (fieldsToUpdate.status) {
      emitProjectEvent(projectId, "task:status_changed", {
        taskId,
        projectId,
        previousStatus: existingTask.status,
        newStatus: fieldsToUpdate.status,
        updatedAt: enrichedTask.updatedAt,
        actorId,
      });
    }

    emitProjectEvent(projectId, "task:updated", enrichedTask);

    return enrichedTask;
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
   * Bulk soft-deletes a list of tasks inside a project.
   *
   * Write order:
   *   1. Flip isDeleted on the read models.
   *   2. Append TASK_DELETED events to the event store.
   *      → On failure: compensate by reverting isDeleted to false.
   *
   * Emits: `task:bulk_deleted` to the project room.
   */
  public static async bulkDeleteTasks(
    taskIds: string[],
    projectId: string,
    actorId: string
  ): Promise<{ success: boolean }> {
    if (taskIds.length === 0) {
      return { success: true };
    }

    // Verify tasks exist in this project and are active
    const tasks = await Task.find({
      taskId: { $in: taskIds },
      projectId,
      isDeleted: false,
    });

    if (tasks.length === 0) {
      throw new ApiError(404, "No active tasks found matching the provided IDs");
    }

    const foundTaskIds = tasks.map((t) => t.taskId);

    // 1. Flip isDeleted on the read models
    await Task.updateMany(
      { taskId: { $in: foundTaskIds }, projectId },
      { $set: { isDeleted: true } }
    );

    // 2. Write events — compensate on failure
    const eventsToCreate = tasks.map((t) => ({
      taskId: t.taskId,
      projectId,
      userId: actorId,
      eventType: "TASK_DELETED",
      payload: {
        taskId: t.taskId,
        title: t.title,
      },
    }));

    let createdEvents: any[] = [];
    try {
      createdEvents = await TaskEvent.insertMany(eventsToCreate);
    } catch (eventErr) {
      // Compensate: revert soft-delete
      await Task.updateMany(
        { taskId: { $in: foundTaskIds }, projectId },
        { $set: { isDeleted: false } }
      ).catch(() => {});
      throw new ApiError(500, "Failed to record bulk deletion events. Tasks restore attempted.");
    }

    // 3. Real-time broadcast
    emitProjectEvent(projectId, "task:bulk_deleted", {
      taskIds: foundTaskIds,
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

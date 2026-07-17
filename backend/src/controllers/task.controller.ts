import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { TaskService } from "../services/task.service";
import { TaskStatus } from "../models/task.model";

export class TaskController {
  /**
   * POST /projects/:projectId/tasks
   *
   * Creates a new task inside the specified project workspace.
   * The requesting user must already be a verified project member
   * (enforced upstream by checkMembership middleware).
   */
  public static createTask = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { projectId } = req.params as { projectId: string };
      const actorId = req.user?.uuid?.id;

      if (!actorId) {
        throw new ApiError(401, "User session not found");
      }

      const { title, description, assigneeId, status } = req.body as {
        title: string;
        description?: string;
        assigneeId?: string;
        status?: TaskStatus;
      };

      const task = await TaskService.createTask(
        projectId,
        title,
        actorId,
        description,
        assigneeId,
        status
      );

      res.status(201).json(
        new ApiResponse(201, task, "Task created successfully")
      );
    }
  );

  /**
   * GET /projects/:projectId/tasks
   *
   * Returns a paginated, filtered list of non-deleted tasks for the project.
   * Supports query params: page, limit, status (Kanban column filter).
   *
   * Response shape:
   * {
   *   data: {
   *     tasks: ITask[],
   *     pagination: { page, limit, total, totalPages }
   *   }
   * }
   */
  public static getProjectTasks = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { projectId } = req.params as { projectId: string };

      // query params are already coerced + validated by Zod via validate middleware
      const { page, limit, status } = req.query as unknown as {
        page: number;
        limit: number;
        status?: TaskStatus;
      };

      const result = await TaskService.getProjectTasks(projectId, {
        page,
        limit,
        status,
      });

      res.status(200).json(
        new ApiResponse(200, result, "Project tasks retrieved successfully")
      );
    }
  );

  /**
   * PATCH /projects/:projectId/tasks/:taskId
   *
   * Transitions a task from its current status to a new one.
   * The controller does NOT perform a blind update — it delegates to the service
   * which reads the current state first, writes a STATUS_CHANGED event log entry
   * containing the full before/after diff, then atomically updates the read model.
   */
  public static updateTaskStatus = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { projectId, taskId } = req.params as {
        projectId: string;
        taskId: string;
      };
      const actorId = req.user?.uuid?.id;

      if (!actorId) {
        throw new ApiError(401, "User session not found");
      }

      const { status } = req.body as { status: TaskStatus };

      const updatedTask = await TaskService.updateTaskStatus(
        taskId,
        projectId,
        status,
        actorId
      );

      res.status(200).json(
        new ApiResponse(200, updatedTask, "Task status updated successfully")
      );
    }
  );

  /**
   * DELETE /projects/:projectId/tasks/:taskId
   *
   * Performs a resilient soft-delete: sets isDeleted=true on the read model
   * and appends a TASK_DELETED event to the immutable event log.
   * The physical record is preserved for audit trail and event sourcing purposes.
   */
  public static softDeleteTask = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { projectId, taskId } = req.params as {
        projectId: string;
        taskId: string;
      };
      const actorId = req.user?.uuid?.id;

      if (!actorId) {
        throw new ApiError(401, "User session not found");
      }

      await TaskService.softDeleteTask(taskId, projectId, actorId);

      res.status(200).json(
        new ApiResponse(200, null, "Task deleted successfully")
      );
    }
  );

  /**
   * GET /projects/:projectId/tasks/:taskId/events
   *
   * Returns the full chronological event log for a single task —
   * every TASK_CREATED, STATUS_CHANGED, and TASK_DELETED event
   * enriched with the actor's profile data.
   */
  public static getTaskEvents = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { projectId, taskId } = req.params as {
        projectId: string;
        taskId: string;
      };

      const events = await TaskService.getTaskEvents(taskId, projectId);

      res.status(200).json(
        new ApiResponse(200, events, "Task event history retrieved successfully")
      );
    }
  );

  /**
   * GET /projects/:projectId/tasks/events
   *
   * Returns all task events across every task in the project, sorted
   * chronologically — useful for a project-level activity/audit feed.
   */
  public static getProjectTaskEvents = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { projectId } = req.params as { projectId: string };

      const events = await TaskService.getProjectTaskEvents(projectId);

      res.status(200).json(
        new ApiResponse(200, events, "Project task events retrieved successfully")
      );
    }
  );
}

import { Router } from "express";
import { TaskController } from "../controllers/task.controller";
import { validate } from "../middleware/validate.middleware";
import { idempotencyMiddleware } from "../middleware/idempotency.middleware";
import {
  createTaskSchema,
  updateTaskStatusSchema,
  getTasksQuerySchema,
} from "../validations/task.validation";

/**
 * Task subrouter — mounted under /projects/:projectId/tasks in project.routes.ts.
 *
 * All routes in this router inherit the `protect` auth guard (applied at the
 * root /api/v1 level) and the `checkMembership` middleware (applied at the
 * /:projectId prefix in project.routes.ts), so no extra auth checks are needed here.
 *
 * Per spec: all verified project members can perform full CRUD on tasks.
 * ProjectManager-only restriction is not applied at the task level.
 *
 * ⚠️  Route ordering is intentional:
 *   - Static segments (/events) must be declared BEFORE param segments (/:taskId)
 *     to prevent Express from matching the literal string "events" as a taskId.
 */
const router = Router({ mergeParams: true });

// ─── GET /projects/:projectId/tasks ──────────────────────────────────────────
// Paginated task listing with optional status filter
router.get(
  "/",
  validate(getTasksQuerySchema),
  TaskController.getProjectTasks
);

// ─── GET /projects/:projectId/tasks/events ───────────────────────────────────
// All task events across the entire project — project-level activity feed
// ⚠️  Must be above /:taskId to avoid "events" being matched as a taskId
router.get("/events", TaskController.getProjectTaskEvents);

// ─── POST /projects/:projectId/tasks ─────────────────────────────────────────
// Create a new task inside this project workspace
router.post(
  "/",
  idempotencyMiddleware,
  validate(createTaskSchema),
  TaskController.createTask
);

// ─── GET /projects/:projectId/tasks/:taskId/events ───────────────────────────
// Chronological event history for a single task (audit trail)
router.get("/:taskId/events", TaskController.getTaskEvents);

// ─── PATCH /projects/:projectId/tasks/:taskId ────────────────────────────────
// Event-sourced status transition — writes STATUS_CHANGED event before updating
router.patch(
  "/:taskId",
  idempotencyMiddleware,
  validate(updateTaskStatusSchema),
  TaskController.updateTaskStatus
);

// ─── DELETE /projects/:projectId/tasks/:taskId ───────────────────────────────
// Soft delete — sets isDeleted=true and appends TASK_DELETED event log
router.delete(
  "/:taskId",
  idempotencyMiddleware,
  TaskController.softDeleteTask
);

export default router;

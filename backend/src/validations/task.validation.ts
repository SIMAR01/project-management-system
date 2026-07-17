import { z } from "zod";
import { TASK_STATUSES } from "../models/task.model";

// ─── Reusable Status Enum ─────────────────────────────────────────────────────

const taskStatusEnum = z.enum(
  TASK_STATUSES as [string, ...string[]],
  { message: "Status must be one of: todo, inprogress, underreview, done" }
);

// ─── Create Task ──────────────────────────────────────────────────────────────

/**
 * Validates the request body when creating a new task.
 */
export const createTaskSchema = z.object({
  body: z.object({
    title: z
      .string({ required_error: "Task title is required" })
      .trim()
      .min(1, "Task title cannot be empty")
      .max(200, "Task title cannot exceed 200 characters"),
    description: z
      .string()
      .trim()
      .max(2000, "Description cannot exceed 2000 characters")
      .optional(),
    assigneeId: z
      .string()
      .trim()
      .min(1, "Assignee ID cannot be empty")
      .optional(),
    status: taskStatusEnum.optional(),
  }),
});

// ─── Update Task Status ───────────────────────────────────────────────────────

/**
 * Validates the request body when transitioning a task's status.
 * The status field is required and strictly enum-validated.
 */
export const updateTaskStatusSchema = z.object({
  body: z.object({
    status: taskStatusEnum,
  }),
});

// ─── Get Project Tasks (Paginated) ────────────────────────────────────────────

/**
 * Validates and coerces query parameters for the paginated task listing endpoint.
 * Query params arrive as raw strings from Express — coerce.number() handles the conversion.
 */
export const getTasksQuerySchema = z.object({
  query: z.object({
    /** Current page number — minimum 1, defaults to 1 */
    page: z.coerce
      .number({ invalid_type_error: "Page must be a positive integer" })
      .int("Page must be an integer")
      .min(1, "Page must be at least 1")
      .default(1),
    /** Records per page — clamped between 1 and 100, defaults to 20 */
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be a positive integer" })
      .int("Limit must be an integer")
      .min(1, "Limit must be at least 1")
      .max(100, "Limit cannot exceed 100")
      .default(20),
    /** Optional status filter — narrows results to a single Kanban column */
    status: taskStatusEnum.optional(),
  }),
});

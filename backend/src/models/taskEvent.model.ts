import { v4 as uuidv4 } from "uuid";
import { Schema, model, Document } from "mongoose";

// ─── Event Type Union ─────────────────────────────────────────────────────────

export type TaskEventType = "TASK_CREATED" | "STATUS_CHANGED" | "TASK_DELETED" | "ASSIGNEE_CHANGED" | "TASK_UPDATED";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ITaskEvent extends Document {
  /** Stable UUID for the event record itself */
  eventId: string;
  /** References Task.taskId (UUID string) */
  taskId: string;
  /** References Project.projectId (UUID string) — denormalized for fast project-scoped queries */
  projectId: string;
  /** References User.uuid.id — the actor who triggered the event */
  userId: string;
  eventType: TaskEventType;
  /**
   * Flexible diff payload.
   * - TASK_CREATED  → { title, description, assigneeId, status, projectId }
   * - STATUS_CHANGED → { previousStatus, newStatus }
   * - TASK_DELETED   → { taskId, title }
   * - ASSIGNEE_CHANGED → { previousAssigneeId, newAssigneeId }
   * - TASK_UPDATED   → { field, previousValue, newValue }
   */
  payload: Record<string, any>;
  timestamp: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const taskEventSchema = new Schema<ITaskEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    taskId: {
      type: String,
      required: true,
    },
    projectId: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    eventType: {
      type: String,
      enum: ["TASK_CREATED", "STATUS_CHANGED", "TASK_DELETED", "ASSIGNEE_CHANGED", "TASK_UPDATED"] as TaskEventType[],
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    /**
     * Intentionally omit mongoose timestamps (createdAt/updatedAt).
     * Events are written once and never mutated — timestamp field is the canonical record time.
     */
    timestamps: false,
    /**
     * Prevent any accidental document updates at the driver level.
     * Event records must never be modified after insertion.
     */
    strict: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * Primary event-sourcing query pattern: "all events for this task, chronologically".
 * Used by task timelines and state-reconstruction replays.
 */
taskEventSchema.index({ taskId: 1, timestamp: 1 });

/**
 * Secondary index for project-scoped event queries (e.g., project audit dashboard).
 */
taskEventSchema.index({ projectId: 1, timestamp: 1 });

// ─── Model ────────────────────────────────────────────────────────────────────

export const TaskEvent = model<ITaskEvent>("TaskEvent", taskEventSchema);

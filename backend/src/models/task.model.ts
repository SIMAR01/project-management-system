import { v4 as uuidv4 } from "uuid";
import { Schema, model, Document } from "mongoose";

// ─── Status Enum ─────────────────────────────────────────────────────────────

export type TaskStatus = "todo" | "inprogress" | "underreview" | "done";

export const TASK_STATUSES: TaskStatus[] = [
  "todo",
  "inprogress",
  "underreview",
  "done",
];

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ITask extends Document {
  /** Primary key — UUID used for stable external references */
  taskId: string;
  /** References Project.projectId (UUID string, not ObjectId) */
  projectId: string;
  title: string;
  description?: string;
  /** References User.uuid.id — nullable for unassigned tasks */
  assigneeId?: string;
  status: TaskStatus;
  /** Soft-delete flag — tasks are never physically removed from the collection */
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const taskSchema = new Schema<ITask>(
  {
    taskId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    projectId: {
      type: String,
      required: [true, "Project ID is required"],
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    assigneeId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: TASK_STATUSES,
      default: "todo",
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * Primary lookup index — used by getProjectTasks to filter active tasks
 * within a project, optionally narrowed by status.
 * Compound order matters: projectId first (equality filter), then status (range/equality).
 */
taskSchema.index({ projectId: 1, status: 1 });

/**
 * Soft-delete filter helper — allows the query engine to efficiently
 * skip deleted records when isDeleted is included in find predicates.
 */
taskSchema.index({ taskId: 1, isDeleted: 1 });

// ─── Model ────────────────────────────────────────────────────────────────────

export const Task = model<ITask>("Task", taskSchema);

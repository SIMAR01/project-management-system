import { v4 as uuidv4 } from "uuid";
import { Schema, model, Document } from "mongoose";

export interface IProjectEvent extends Document {
  eventId: string;
  projectId: string; // References Project.projectId (UUID)
  eventType:
    | "PROJECT_CREATED"
    | "PROJECT_UPDATED"
    | "PROJECT_ARCHIVED"
    | "PROJECT_DELETED"
    | "MEMBER_INVITED"
    | "MEMBER_REMOVED";
  payload: Record<string, any>;
  actorId: string; // References User.uuid.id
  timestamp: Date;
}

const projectEventSchema = new Schema<IProjectEvent>({
  eventId: {
    type: String,
    required: true,
    unique: true,
    default: () => uuidv4(),
  },
  projectId: {
    type: String,
    required: true,
  },
  eventType: {
    type: String,
    enum: [
      "PROJECT_CREATED",
      "PROJECT_UPDATED",
      "PROJECT_ARCHIVED",
      "PROJECT_DELETED",
      "MEMBER_INVITED",
      "MEMBER_REMOVED",
    ],
    required: true,
  },
  payload: {
    type: Schema.Types.Mixed,
    default: {},
  },
  actorId: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Index for chronological querying and sorting
projectEventSchema.index({ projectId: 1, timestamp: 1 });

export const ProjectEvent = model<IProjectEvent>("ProjectEvent", projectEventSchema);

import { v4 as uuidv4 } from "uuid";
import { Schema, model, Document } from "mongoose";

export interface IProjectMember {
  userId: string; // references user.uuid.id
  role: "ProjectManager" | "TeamMember";
}

export interface IProject extends Document {
  projectId: string; // Unique workspace identifier (UUID)
  name: string;
  description?: string;
  owner: string; // references user.uuid.id
  members: IProjectMember[];
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    projectId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    name: {
      type: String,
      required: [true, "Project name is required"],
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
    },
    owner: {
      type: String,
      required: true,
    },
    members: [
      {
        userId: {
          type: String,
          required: true,
        },
        role: {
          type: String,
          enum: ["ProjectManager", "TeamMember"],
          required: true,
        },
      },
    ],
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index projectId for fast lookups
projectSchema.index({ projectId: 1 });

export const Project = model<IProject>("Project", projectSchema);

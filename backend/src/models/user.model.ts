import { v4 as uuidv4 } from "uuid";
import { Schema, model, Document } from "mongoose";
import { hashPassword } from "../utils/password";

/**
 * Interface representing the core properties of a User document.
 */
export interface IUser extends Document {
  uuid: {
    id: string;
  };
  name: string;
  username: string;
  email: string;
  password: string;
  refreshTokens?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    uuid: {
      id: {
        type: String,
        required: true,
        unique: true,
        default: () => uuidv4(),
      }
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false, // Ensures password is never returned in queries by default
    },
    refreshTokens: {
      type: [String],
      select: false,
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre<IUser>("save", async function () {
  if (this.isModified("password")) {
    this.password = await hashPassword(this.password);
  }
});

export const User = model<IUser>("User", userSchema);

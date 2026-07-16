import { z } from "zod";

/**
 * Validation schema for the registration payload.
 */
export const registerSchema = z.object({
  body: z.object({
    name: z
      .string({
        required_error: "Name is required",
      })
      .min(2, "Name must be at least 2 characters")
      .max(50, "Name cannot exceed 50 characters")
      .trim(),
    username: z
      .string({
        required_error: "Username is required",
      })
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username cannot exceed 30 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
      .lowercase()
      .trim(),
    email: z
      .string({
        required_error: "Email is required",
      })
      .email("Invalid email address")
      .lowercase()
      .trim(),
    password: z
      .string({
        required_error: "Password is required",
      })
      .min(6, "Password must be at least 6 characters")
      .max(128, "Password cannot exceed 128 characters"),
  }),
});

/**
 * Validation schema for the login payload.
 */
export const loginSchema = z.object({
  body: z.object({
    emailOrUsername: z
      .string({
        required_error: "Email or username is required",
      })
      .trim(),
    password: z
      .string({
        required_error: "Password is required",
      }),
  }),
});

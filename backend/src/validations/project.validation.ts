import { z } from "zod";

/**
 * Validation schema for creating a project.
 */
export const createProjectSchema = z.object({
  body: z.object({
    name: z
      .string("Project name is required")
      .min(3, "Project name must be at least 3 characters")
      .max(100, "Project name cannot exceed 100 characters")
      .trim(),
    description: z
      .string()
      .max(500, "Description cannot exceed 500 characters")
      .trim()
      .optional(),
  }),
});

/**
 * Validation schema for updating a project.
 */
export const updateProjectSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(3, "Project name must be at least 3 characters")
      .max(100, "Project name cannot exceed 100 characters")
      .trim()
      .optional(),
    description: z
      .string()
      .max(500, "Description cannot exceed 500 characters")
      .trim()
      .optional(),
  }),
});

/**
 * Validation schema for inviting a member.
 */
export const inviteMemberSchema = z.object({
  body: z.object({
    emailOrUsername: z
      .string("Email or username of the invitee is required")
      .trim()
      .min(1, "Email or username cannot be empty"),
    role: z.enum(["ProjectManager", "TeamMember"], {
      message: "Role must be either 'ProjectManager' or 'TeamMember'",
    }),
  }),
});

/**
 * Validation schema for removing a member.
 */
export const removeMemberSchema = z.object({
  body: z.object({
    userId: z
      .string("User ID is required for removal")
      .trim()
      .min(1, "User ID cannot be empty"),
  }),
});

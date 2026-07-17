import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Project } from "../models/project.model";

/**
 * Middleware to verify that the authenticated user belongs to the requested project.
 * Resolves the project and attaches it to `req.project`.
 */
export const checkMembership = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const { projectId } = req.params;

    if (!projectId) {
      throw new ApiError(400, "Project ID parameter is missing");
    }

    const project = await Project.findOne({ projectId });
    if (!project) {
      throw new ApiError(404, "Project workspace not found");
    }

    const userId = req.user?.uuid?.id;
    if (!userId) {
      throw new ApiError(401, "Not authorized: User session details not found");
    }

    // Owner is implicitly a member. Other members must exist in the members list.
    const isOwner = project.owner === userId;
    const membership = project.members.find((m) => m.userId === userId);

    if (!isOwner && !membership) {
      throw new ApiError(403, "Access denied: You are not a member of this project workspace");
    }

    // Attach project instance to request context
    req.project = project;
    next();
  }
);

/**
 * Middleware to restrict route execution to specific roles inside the project workspace.
 * Requires that checkMembership middleware was executed beforehand.
 *
 * @param roles Array of authorized roles ('ProjectManager' or 'TeamMember').
 */
export const requireRole = (roles: Array<"ProjectManager" | "TeamMember">) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const project = req.project;
    const userId = req.user?.uuid?.id;

    if (!project || !userId) {
      throw new ApiError(500, "Internal Server Error: RBAC requires checkMembership middleware to run first");
    }

    // Owner always has ProjectManager privileges
    const isOwner = project.owner === userId;
    const membership = project.members.find((m) => m.userId === userId);
    const userRole = isOwner ? "ProjectManager" : membership?.role;

    if (!userRole || !roles.includes(userRole)) {
      throw new ApiError(
        403,
        `Access denied: This operation requires one of the following roles: ${roles.join(", ")}`
      );
    }

    next();
  };
};

import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { ProjectService } from "../services/project.service";

export class ProjectController {
  /**
   * Handler to create a new project workspace.
   */
  public static create = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, description } = req.body;
    const ownerId = req.user?.uuid?.id;

    if (!ownerId) {
      throw new ApiError(401, "User session not found");
    }

    const project = await ProjectService.createProject(name, description, ownerId);

    res.status(201).json(
      new ApiResponse(201, project, "Project workspace created successfully")
    );
  });

  /**
   * Handler to update project metadata.
   */
  public static update = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params as { projectId: string };
    const { name, description } = req.body;
    const actorId = req.user?.uuid?.id;

    if (!actorId) {
      throw new ApiError(401, "User session not found");
    }

    const project = await ProjectService.updateProject(projectId, name, description, actorId);

    res.status(200).json(
      new ApiResponse(200, project, "Project workspace updated successfully")
    );
  });

  /**
   * Handler to archive a project workspace.
   */
  public static archive = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params as { projectId: string };
    const actorId = req.user?.uuid?.id;

    if (!actorId) {
      throw new ApiError(401, "User session not found");
    }

    const project = await ProjectService.archiveProject(projectId, actorId);

    res.status(200).json(
      new ApiResponse(200, project, "Project workspace archived successfully")
    );
  });

  /**
   * Handler to delete a project workspace.
   */
  public static delete = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params as { projectId: string };
    const actorId = req.user?.uuid?.id;

    if (!actorId) {
      throw new ApiError(401, "User session not found");
    }

    await ProjectService.deleteProject(projectId, actorId);

    res.status(200).json(
      new ApiResponse(200, null, "Project workspace deleted successfully")
    );
  });

  /**
   * Handler to invite a member.
   */
  public static invite = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params as { projectId: string };
    const { emailOrUsername, role } = req.body;
    const actorId = req.user?.uuid?.id;

    if (!actorId) {
      throw new ApiError(401, "User session not found");
    }

    const project = await ProjectService.inviteMember(
      projectId,
      emailOrUsername,
      role as "ProjectManager" | "TeamMember",
      actorId
    );

    res.status(200).json(
      new ApiResponse(200, project, "Member invited successfully to workspace")
    );
  });

  /**
   * Handler to remove a member.
   */
  public static remove = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params as { projectId: string };
    const { userId } = req.body;
    const actorId = req.user?.uuid?.id;

    if (!actorId) {
      throw new ApiError(401, "User session not found");
    }

    const project = await ProjectService.removeMember(projectId, userId, actorId);

    res.status(200).json(
      new ApiResponse(200, project, "Member removed successfully from workspace")
    );
  });

  /**
   * Handler to list user's workspaces.
   */
  public static list = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.uuid?.id;
    if (!userId) {
      throw new ApiError(401, "User session not found");
    }

    const projects = await ProjectService.getUserProjects(userId);

    res.status(200).json(
      new ApiResponse(200, projects, "User project workspaces retrieved successfully")
    );
  });

  /**
   * Handler to list user's owned workspaces.
   */
  public static listCreated = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.uuid?.id;
    if (!userId) {
      throw new ApiError(401, "User session not found");
    }

    const projects = await ProjectService.getOwnedProjects(userId);

    res.status(200).json(
      new ApiResponse(200, projects, "Owned project workspaces retrieved successfully")
    );
  });

  /**
   * Handler to get detailed metadata of a single workspace.
   */
  public static getDetails = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Already loaded and verified by checkMembership middleware
    const project = req.project;

    res.status(200).json(
      new ApiResponse(200, project, "Project workspace details retrieved successfully")
    );
  });

  /**
   * Handler to get project timeline.
   */
  public static getTimeline = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params as { projectId: string };

    const timeline = await ProjectService.getProjectTimeline(projectId);

    res.status(200).json(
      new ApiResponse(200, timeline, "Project timeline activity retrieved successfully")
    );
  });
}

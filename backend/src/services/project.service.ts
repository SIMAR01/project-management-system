import { Project, IProject } from "../models/project.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { EventService } from "./event.service";
import { emitProjectEvent, evictUserFromProject, notifyUserOfInvite } from "../sockets/project.socket";
import { ProjectEvent } from "../models/projectEvent.model";

export class ProjectService {
  /**
   * Creates a new project workspace.
   */
  public static async createProject(
    name: string,
    description: string | undefined,
    ownerId: string
  ): Promise<IProject> {
    const trimmedName = name.trim();
    const existingProject = await Project.findOne({ name: trimmedName });
    if (existingProject) {
      throw new ApiError(400, "Project name must be unique. A project with this name already exists.");
    }

    // 1. Create the project instance
    const project = new Project({
      name: trimmedName,
      description,
      owner: ownerId,
      members: [{ userId: ownerId, role: "ProjectManager" }],
    });

    const savedProject = await project.save();

    // 2. Record audit log event
    await EventService.recordEvent(
      savedProject.projectId,
      "PROJECT_CREATED",
      { name: trimmedName, description, ownerId },
      ownerId
    );

    // 3. Emit real-time creation event (owner's workspace list update)
    emitProjectEvent(savedProject.projectId, "project:created", {
      projectId: savedProject.projectId,
      name: savedProject.name,
    });

    return savedProject;
  }

  /**
   * Updates project details.
   */
  public static async updateProject(
    projectId: string,
    name: string | undefined,
    description: string | undefined,
    actorId: string
  ): Promise<IProject> {
    const project = await Project.findOne({ projectId });
    if (!project) {
      throw new ApiError(404, "Project workspace not found");
    }

    if (project.isArchived) {
      throw new ApiError(400, "Cannot edit an archived project workspace");
    }

    const originalName = project.name;
    const originalDescription = project.description;

    if (name !== undefined) {
      const trimmedName = name.trim();
      const existingProject = await Project.findOne({ name: trimmedName, projectId: { $ne: projectId } });
      if (existingProject) {
        throw new ApiError(400, "Project name must be unique. A project with this name already exists.");
      }
      project.name = trimmedName;
    }
    if (description !== undefined) project.description = description;

    const updatedProject = await project.save();

    // Record event sourcing log
    await EventService.recordEvent(
      projectId,
      "PROJECT_UPDATED",
      {
        previous: { name: originalName, description: originalDescription },
        updated: { name: project.name, description: project.description },
      },
      actorId
    );

    // Notify members real-time
    emitProjectEvent(projectId, "project:updated", {
      projectId,
      name: updatedProject.name,
      description: updatedProject.description,
    });

    return updatedProject;
  }

  /**
   * Archives a project workspace.
   */
  public static async archiveProject(
    projectId: string,
    actorId: string
  ): Promise<IProject> {
    const project = await Project.findOne({ projectId });
    if (!project) {
      throw new ApiError(404, "Project workspace not found");
    }

    if (project.isArchived) {
      throw new ApiError(400, "Project workspace is already archived");
    }

    project.isArchived = true;
    const updatedProject = await project.save();

    // Record event
    await EventService.recordEvent(projectId, "PROJECT_ARCHIVED", {}, actorId);

    // Notify members real-time
    emitProjectEvent(projectId, "project:archived", { projectId });

    return updatedProject;
  }

  /**
   * Deletes a project workspace.
   */
  public static async deleteProject(
    projectId: string,
    actorId: string
  ): Promise<{ success: boolean }> {
    const project = await Project.findOne({ projectId });
    if (!project) {
      throw new ApiError(404, "Project workspace not found");
    }

    await Project.deleteOne({ projectId });

    // Record event sourcing log
    await EventService.recordEvent(projectId, "PROJECT_DELETED", {}, actorId);

    // Emit deletion event to room
    emitProjectEvent(projectId, "project:deleted", { projectId });

    return { success: true };
  }

  /**
   * Invites a member to the project workspace.
   */
  public static async inviteMember(
    projectId: string,
    emailOrUsername: string,
    role: "ProjectManager" | "TeamMember",
    actorId: string
  ): Promise<IProject> {
    const project = await Project.findOne({ projectId });
    if (!project) {
      throw new ApiError(404, "Project workspace not found");
    }

    if (project.isArchived) {
      throw new ApiError(400, "Cannot invite members to an archived workspace");
    }

    // Find the user to invite
    const queryTerm = emailOrUsername.toLowerCase().trim();
    const invitee = await User.findOne({
      $or: [{ email: queryTerm }, { username: queryTerm }],
    });

    if (!invitee) {
      throw new ApiError(404, "Invitee user profile not found");
    }

    const inviteeId = invitee.uuid.id;

    // Check if user is already a member
    const isAlreadyMember = project.members.some((m) => m.userId === inviteeId);
    if (isAlreadyMember) {
      throw new ApiError(409, "User is already a member of this project workspace");
    }

    // Add user to project
    project.members.push({ userId: inviteeId, role });
    const updatedProject = await project.save();

    // Record event sourcing audit log
    await EventService.recordEvent(
      projectId,
      "MEMBER_INVITED",
      {
        inviteeId,
        username: invitee.username,
        email: invitee.email,
        role,
      },
      actorId
    );

    // Notify existing project room members
    emitProjectEvent(projectId, "member:invited", {
      projectId,
      member: {
        userId: inviteeId,
        name: invitee.name,
        username: invitee.username,
        role,
      },
    });

    // Directly notify the newly invited user's active socket sessions
    // so the project appears in their workspace list without a page refresh.
    notifyUserOfInvite(projectId, inviteeId, updatedProject);

    return updatedProject;
  }

  /**
   * Removes a member from the project workspace.
   */
  public static async removeMember(
    projectId: string,
    targetUserId: string,
    actorId: string
  ): Promise<IProject> {
    const project = await Project.findOne({ projectId });
    if (!project) {
      throw new ApiError(404, "Project workspace not found");
    }

    if (project.isArchived) {
      throw new ApiError(400, "Cannot remove members from an archived workspace");
    }

    if (project.owner === targetUserId) {
      throw new ApiError(400, "Operation rejected: The workspace owner cannot be removed");
    }

    // Verify that target user is a member
    const memberIndex = project.members.findIndex((m) => m.userId === targetUserId);
    if (memberIndex === -1) {
      throw new ApiError(404, "User is not a member of this project workspace");
    }

    // Remove from members array
    project.members.splice(memberIndex, 1);
    const updatedProject = await project.save();

    // Record event sourcing audit log
    await EventService.recordEvent(
      projectId,
      "MEMBER_REMOVED",
      { targetUserId },
      actorId
    );

    // Notify project workspace room that a member was removed
    emitProjectEvent(projectId, "member:removed", {
      projectId,
      userId: targetUserId,
    });

    // Evict user's live sockets from the room
    evictUserFromProject(projectId, targetUserId);

    return updatedProject;
  }

  /**
   * Lists all projects that the user belongs to (as owner or member).
   */
  public static async getUserProjects(userId: string): Promise<IProject[]> {
    return await Project.find({
      $or: [{ owner: userId }, { "members.userId": userId }],
    });
  }

  /**
   * Lists all projects created/owned by the user.
   */
  public static async getOwnedProjects(userId: string): Promise<IProject[]> {
    return await Project.find({ owner: userId });
  }

  /**
   * Retrieves the project timeline showing all chronological events.
   */
  public static async getProjectTimeline(projectId: string): Promise<any[]> {
    const events = await ProjectEvent.find({ projectId }).sort({ timestamp: 1 });

    // Extract unique actor IDs to fetch details in a batch query
    const actorIds = Array.from(new Set(events.map((e) => e.actorId)));
    const users = await User.find({ "uuid.id": { $in: actorIds } });

    // Map profiles for quick lookup
    const userMap = new Map<string, { name: string; username: string; email: string }>();
    for (const u of users) {
      userMap.set(u.uuid.id, {
        name: u.name,
        username: u.username,
        email: u.email,
      });
    }

    return events.map((e) => {
      const eventObj = e.toObject();
      return {
        ...eventObj,
        actor: userMap.get(e.actorId) || {
          name: "Unknown User",
          username: "unknown",
          email: "unknown@example.com",
        },
      };
    });
  }

  /**
   * Basic permission helper to check if a user is a member of the project.
   */
  public static async checkUserAccess(userId: string, projectId: string): Promise<boolean> {
    const project = await Project.findOne({ projectId });
    if (!project) return false;
    return project.owner === userId || project.members.some((m) => m.userId === userId);
  }
}

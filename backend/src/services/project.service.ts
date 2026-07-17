import { Project, IProject } from "../models/project.model";
import { Task } from "../models/task.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { EventService } from "./event.service";
import { emitProjectEvent, evictUserFromProject, notifyUserOfInvite } from "../sockets/project.socket";
import { ProjectEvent } from "../models/projectEvent.model";
import { TaskEvent } from "../models/taskEvent.model";

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

    // Check if the project has tasks inside (either active or deleted, check all tasks)
    const taskCount = await Task.countDocuments({ projectId });

    if (taskCount === 0) {
      // No tasks -> delete from database permanently
      await Project.deleteOne({ projectId });
      await EventService.recordEvent(projectId, "PROJECT_DELETED", { deletionType: "hard" }, actorId);
    } else {
      // Has tasks -> update "isDeleted" to true for the project and all its tasks
      await Project.updateOne({ projectId }, { $set: { isDeleted: true } });
      await Task.updateMany({ projectId }, { $set: { isDeleted: true } });
      await EventService.recordEvent(projectId, "PROJECT_DELETED", { deletionType: "soft" }, actorId);
    }

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
   * Helper to enrich projects with owner and member user profiles.
   */
  public static async enrichProjects(projects: any[]): Promise<any[]> {
    if (projects.length === 0) return [];

    const userIds = new Set<string>();
    for (const p of projects) {
      if (p.owner) userIds.add(p.owner);
      if (p.members) {
        for (const m of p.members) {
          if (m.userId) userIds.add(m.userId);
        }
      }
    }

    const users = await User.find({ "uuid.id": { $in: Array.from(userIds) } }).lean();
    const userMap = new Map<string, any>();
    for (const u of users) {
      userMap.set(u.uuid.id, u);
    }

    return projects.map((p) => {
      const pObj = typeof p.toObject === "function" ? p.toObject() : p;
      const ownerUser = userMap.get(pObj.owner);
      const enrichedMembers = (pObj.members || []).map((m: any) => {
        const memberUser = userMap.get(m.userId);
        return {
          ...m,
          name: memberUser?.name || "Unknown User",
          username: memberUser?.username || "unknown",
          email: memberUser?.email || "",
        };
      });

      return {
        ...pObj,
        ownerName: ownerUser?.name || "Unknown User",
        ownerUsername: ownerUser?.username || "unknown",
        ownerEmail: ownerUser?.email || "",
        members: enrichedMembers,
      };
    });
  }

  /**
   * Retrieves the project timeline showing all chronological events (both project and task events).
   */
  public static async getProjectTimeline(projectId: string): Promise<any[]> {
    const projectEvents = await ProjectEvent.find({ projectId }).lean();
    const taskEvents = await TaskEvent.find({ projectId }).lean();

    // Extract unique actor IDs to fetch details in a batch query
    const actorIds = Array.from(
      new Set([
        ...projectEvents.map((e) => e.actorId),
        ...taskEvents.map((e) => e.userId),
      ])
    );
    const users = await User.find({ "uuid.id": { $in: actorIds } }).lean();

    // Map profiles for quick lookup
    const userMap = new Map<string, { name: string; username: string; email: string }>();
    for (const u of users) {
      userMap.set(u.uuid.id, {
        name: u.name,
        username: u.username,
        email: u.email,
      });
    }

    const mergedEvents = [
      ...projectEvents.map((e) => ({
        ...e,
        id: e.eventId || (e as any)._id?.toString(),
        actor: userMap.get(e.actorId) || {
          name: "Unknown User",
          username: "unknown",
          email: "unknown@example.com",
        },
      })),
      ...taskEvents.map((e) => ({
        ...e,
        id: e.eventId || (e as any)._id?.toString(),
        actorId: e.userId,
        actor: userMap.get(e.userId) || {
          name: "Unknown User",
          username: "unknown",
          email: "unknown@example.com",
        },
      })),
    ];

    // Sort chronologically (oldest first)
    mergedEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return mergedEvents;
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

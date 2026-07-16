import { Server, Socket } from "socket.io";
import { Project } from "../models/project.model";

let ioInstance: Server | null = null;

/**
 * Registry hook to cache the running global Socket.IO Server object.
 */
export const setIoInstance = (io: Server): void => {
  ioInstance = io;
};

/**
 * Emits a real-time event message to all socket connections inside a specific project room.
 *
 * @param projectId The unique project UUID identifier.
 * @param event The event action key.
 * @param data Data payload attached to the notification.
 */
export const emitProjectEvent = (projectId: string, event: string, data: any): void => {
  if (ioInstance) {
    const room = `project:${projectId}`;
    console.log(`[Socket] Emitting event '${event}' to room '${room}'`);
    ioInstance.to(room).emit(event, data);
  } else {
    console.warn("[Socket] Failed to emit event: ioInstance is not set");
  }
};

/**
 * Dynamically leaves the specified project room for all active sockets of a removed user.
 * Sends a real-time eviction notification directly to those connections.
 *
 * @param projectId The unique project UUID.
 * @param userId The unique user UUID of the evicted member.
 */
export const evictUserFromProject = (projectId: string, userId: string): void => {
  if (!ioInstance) {
    console.warn("[Socket] Failed to evict user: ioInstance is not set");
    return;
  }

  const room = `project:${projectId}`;
  console.log(`[Socket] Evicting user '${userId}' from room '${room}'`);

  // Retrieve active socket connections pool
  const activeSockets = ioInstance.sockets.sockets;

  for (const socket of activeSockets.values()) {
    const socketUser = (socket as any).user;
    // Check matching user ID from JWT payload
    if (socketUser && socketUser.id === userId) {
      socket.leave(room);
      // Emit direct private eviction notification to the client
      socket.emit("workspace:evicted", { projectId });
      console.log(`[Socket] Evicted socket connection: ${socket.id} (User: ${userId})`);
    }
  }
};

/**
 * Connects the project room membership listeners during connection lifecycle hooks.
 */
export const registerProjectSocketHandlers = (io: Server, socket: Socket): void => {
  const user = (socket as any).user;

  socket.on("join_project", async ({ projectId }: { projectId: string }) => {
    if (!projectId) {
      socket.emit("error", { message: "Project ID is required to join" });
      return;
    }

    try {
      // Validate membership in database before allowing connection to join room
      const project = await Project.findOne({ projectId });
      if (!project) {
        socket.emit("error", { message: "Project workspace not found" });
        return;
      }

      const isMember =
        project.owner === user.id || project.members.some((m) => m.userId === user.id);

      if (!isMember) {
        socket.emit("error", {
          message: "Access Denied: You do not belong to this project workspace",
        });
        return;
      }

      const room = `project:${projectId}`;
      socket.join(room);
      socket.emit("project:joined", { projectId });
      console.log(`[Socket] User ${user.username} (ID: ${user.id}) joined room: ${room}`);
    } catch (err) {
      console.error("[Socket] Error joining project room:", err);
      socket.emit("error", { message: "Internal server error occurred while joining workspace room" });
    }
  });
};

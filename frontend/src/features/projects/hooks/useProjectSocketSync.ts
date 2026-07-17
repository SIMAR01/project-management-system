import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { useAuth } from "../../../context/AuthContext";
import { getAccessToken } from "../../../api/axiosClient";
import { useWorkspacesQuery } from "./useProjectQueries";
import { ProjectWorkspace } from "../types/project.types";

const mapProject = (p: any): ProjectWorkspace => ({
  ...p,
  id: p.projectId,
  ownerId: p.owner,
});

/**
 * Hook that binds Socket.IO event listeners to the TanStack Query Client cache matrix.
 */
export const useProjectSocketSync = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = user?.id;
  const token = getAccessToken();

  const { data: workspaces } = useWorkspacesQuery();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socketUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1")
      .replace("/api/v1", "");

    console.log(`[Socket] Connecting to: ${socketUrl}`);
    const socket = io(socketUrl, {
      auth: {
        token,
      },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Socket] Connected successfully");
      // Join all project rooms once connected
      if (workspaces) {
        workspaces.forEach((w) => {
          socket.emit("join_project", { projectId: w.projectId });
        });
      }
    });

    socket.on("reconnect", () => {
      console.log("[Socket] Reconnected, refetching caches...");
      // Trigger a silent cache invalidation refetch
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    });

    // Real-time listener: project:created
    socket.on("project:created", (newProject: any) => {
      console.log("[Socket] Real-time event 'project:created':", newProject);
      queryClient.setQueryData<ProjectWorkspace[]>(["workspaces"], (old) => {
        if (!old) return [mapProject(newProject)];
        if (old.some((w) => w.projectId === newProject.projectId)) return old;
        return [...old, mapProject(newProject)];
      });
    });

    // Real-time listener: project:updated
    socket.on("project:updated", (updatedProject: any) => {
      console.log("[Socket] Real-time event 'project:updated':", updatedProject);
      queryClient.setQueryData<ProjectWorkspace[]>(["workspaces"], (old) => {
        if (!old) return [];
        return old.map((w) =>
          w.projectId === updatedProject.projectId
            ? { ...w, ...mapProject(updatedProject) }
            : w
        );
      });
      queryClient.invalidateQueries({ queryKey: ["project-activity", updatedProject.projectId] });
    });

    // Real-time listener: project:deleted
    socket.on("project:deleted", ({ projectId }: { projectId: string }) => {
      console.log("[Socket] Real-time event 'project:deleted':", projectId);
      queryClient.setQueryData<ProjectWorkspace[]>(["workspaces"], (old) => {
        if (!old) return [];
        return old.filter((w) => w.projectId !== projectId);
      });
      queryClient.removeQueries({ queryKey: ["project-activity", projectId] });
      navigate("/dashboard");
    });

    // Real-time listener: workspace:evicted (direct eviction)
    socket.on("workspace:evicted", ({ projectId }: { projectId: string }) => {
      console.log("[Socket] Real-time event 'workspace:evicted':", projectId);
      queryClient.setQueryData<ProjectWorkspace[]>(["workspaces"], (old) => {
        if (!old) return [];
        return old.filter((w) => w.projectId !== projectId);
      });
      queryClient.removeQueries({ queryKey: ["project-activity", projectId] });
      navigate("/dashboard");
    });

    // Real-time listener: member:removed (eviction catch-all)
    socket.on("member:removed", ({ projectId, userId }: { projectId: string; userId: string }) => {
      console.log(`[Socket] Real-time event 'member:removed' for user: ${userId}`);
      if (userId === currentUserId) {
        queryClient.setQueryData<ProjectWorkspace[]>(["workspaces"], (old) => {
          if (!old) return [];
          return old.filter((w) => w.projectId !== projectId);
        });
        queryClient.removeQueries({ queryKey: ["project-activity", projectId] });
        navigate("/dashboard");
      } else {
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        queryClient.invalidateQueries({ queryKey: ["project-activity", projectId] });
      }
    });

    // Real-time listener: member:invited (for users already in the room)
    socket.on("member:invited", ({ projectId }: { projectId: string }) => {
      console.log("[Socket] Real-time event 'member:invited' inside project:", projectId);
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["project-activity", projectId] });
    });

    // Real-time listener: workspace:invited (direct push to the newly invited user)
    // The backend emits this privately to the invitee's socket, bypassing the project room
    // (which the user hasn't joined yet). We add the project to the cache immediately
    // and join the new room so subsequent room events are received in real-time.
    socket.on("workspace:invited", ({ projectId, project }: { projectId: string; project: any }) => {
      console.log("[Socket] Real-time event 'workspace:invited' for project:", projectId);
      queryClient.setQueryData<ProjectWorkspace[]>(["workspaces"], (old) => {
        if (!old) return [mapProject(project)];
        // Guard against duplicates
        if (old.some((w) => w.projectId === projectId)) return old;
        return [...old, mapProject(project)];
      });
      // Join the project room immediately so future room events (updates/deletes) are received
      socket.emit("join_project", { projectId });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, workspaces, currentUserId, queryClient, navigate]);

  // Dynamically join rooms as new project workspaces are loaded
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !workspaces) return;

    workspaces.forEach((w) => {
      socket.emit("join_project", { projectId: w.projectId });
    });
  }, [workspaces]);

  return socketRef.current;
};

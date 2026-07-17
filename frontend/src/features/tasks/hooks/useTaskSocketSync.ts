import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { useAuth } from "../../../context/AuthContext";
import { getAccessToken } from "../../../api/axiosClient";
import { Task } from "../types/task.types";

/**
 * Hook that binds Socket.IO task events to the local TanStack Query cache.
 * Ensures the Kanban board stays in perfect sync across all clients.
 */
export const useTaskSocketSync = (projectId: string) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = user?.id;
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !projectId) return;

    const socketUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1")
      .replace("/api/v1", "");

    const socket = io(socketUrl, {
      auth: { token },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      // Join the project room to receive task events for this project
      socket.emit("join_project", { projectId });
    });

    socket.on("reconnect", () => {
      // Refetch full list on reconnect to prevent data drift
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    });

    // ─── Real-time Listeners ──────────────────────────────────────────────────

    socket.on("task:created", (newTask: Task) => {
      queryClient.setQueryData<Task[]>(["project-tasks", projectId], (old) => {
        if (!old) return [newTask];
        if (old.some((t) => t.taskId === newTask.taskId)) return old;
        return [newTask, ...old];
      });
    });

    socket.on("task:status_changed", (data: { taskId: string; previousStatus: string; newStatus: string; updatedAt: string }) => {
      queryClient.setQueryData<Task[]>(["project-tasks", projectId], (old) => {
        if (!old) return [];
        return old.map((t) =>
          t.taskId === data.taskId
            ? { ...t, status: data.newStatus as any, updatedAt: data.updatedAt }
            : t
        );
      });
    });

    socket.on("task:updated", (updatedTask: Task) => {
      queryClient.setQueryData<Task[]>(["project-tasks", projectId], (old) => {
        if (!old) return [];
        return old.map((t) =>
          t.taskId === updatedTask.taskId ? updatedTask : t
        );
      });
      queryClient.invalidateQueries({ queryKey: ["task-events", projectId, updatedTask.taskId] });
      queryClient.invalidateQueries({ queryKey: ["project-activity", projectId] });
    });

    socket.on("task:deleted", (data: { taskId: string }) => {
      queryClient.setQueryData<Task[]>(["project-tasks", projectId], (old) => {
        if (!old) return [];
        return old.filter((t) => t.taskId !== data.taskId);
      });
      queryClient.invalidateQueries({ queryKey: ["project-activity", projectId] });
    });

    socket.on("task:bulk_deleted", (data: { taskIds: string[] }) => {
      queryClient.setQueryData<Task[]>(["project-tasks", projectId], (old) => {
        if (!old) return [];
        return old.filter((t) => !data.taskIds.includes(t.taskId));
      });
      queryClient.invalidateQueries({ queryKey: ["project-activity", projectId] });
    });

    socket.on("workspace:evicted", (data: { projectId: string }) => {
      if (data.projectId === projectId) {
        console.log(`[Socket] Eviction detected for project ${projectId}. Redirecting to dashboard.`);
        queryClient.removeQueries({ queryKey: ["project-tasks", projectId] });
        queryClient.removeQueries({ queryKey: ["project-activity", projectId] });
        navigate("/dashboard");
      }
    });

    socket.on("member:removed", (data: { projectId: string; userId: string }) => {
      if (data.projectId === projectId && data.userId === currentUserId) {
        console.log(`[Socket] Member removed detected for current user on project ${projectId}. Redirecting.`);
        queryClient.removeQueries({ queryKey: ["project-tasks", projectId] });
        queryClient.removeQueries({ queryKey: ["project-activity", projectId] });
        navigate("/dashboard");
      }
    });

    socket.on("project:deleted", (data: { projectId: string }) => {
      if (data.projectId === projectId) {
        console.log(`[Socket] Project ${projectId} deleted. Redirecting.`);
        queryClient.removeQueries({ queryKey: ["project-tasks", projectId] });
        queryClient.removeQueries({ queryKey: ["project-activity", projectId] });
        navigate("/dashboard");
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [projectId, queryClient, navigate, currentUserId]);

  return socketRef.current;
};

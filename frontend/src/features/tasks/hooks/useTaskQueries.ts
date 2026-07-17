import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import { axiosClient } from "../../../api/axiosClient";
import {
  Task,
  TaskStatus,
  PaginatedTasksResponse,
  SingleTaskResponse,
  CreateTaskPayload,
  UpdateTaskStatusPayload,
  UpdateTaskPayload,
} from "../types/task.types";

const generateIdempotencyKey = (prefix: string) => `${prefix}-${uuidv4()}`;

// ─── QUERIES ─────────────────────────────────────────────────────────────────

/**
 * Fetches all tasks for a given project.
 * Uses a high limit for the Kanban board view.
 */
export const useProjectTasksQuery = (projectId: string) => {
  return useQuery({
    queryKey: ["project-tasks", projectId],
    queryFn: async (): Promise<Task[]> => {
      const response = await axiosClient.get<PaginatedTasksResponse>(
        `/projects/${projectId}/tasks?limit=100`
      );
      return response.data.data.tasks;
    },
    enabled: !!projectId,
  });
};

/**
 * Hook to retrieve the chronological activity timeline for a single task.
 */
export const useTaskEventsQuery = (projectId: string, taskId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["task-events", projectId, taskId],
    queryFn: async () => {
      const response = await axiosClient.get<{ data: any[] }>(
        `/projects/${projectId}/tasks/${taskId}/events`
      );
      return response.data.data;
    },
    enabled: !!projectId && !!taskId && enabled,
  });
};

// ─── MUTATIONS ───────────────────────────────────────────────────────────────

/**
 * Creates a new task with optimistic caching.
 */
export const useCreateTaskMutation = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateTaskPayload) => {
      const response = await axiosClient.post<SingleTaskResponse>(
        `/projects/${projectId}/tasks`,
        payload,
        {
          headers: {
            "X-Idempotency-Key": generateIdempotencyKey("task-create"),
          },
        }
      );
      return response.data.data;
    },
    onMutate: async (newTaskParams) => {
      await queryClient.cancelQueries({ queryKey: ["project-tasks", projectId] });
      const previousTasks = queryClient.getQueryData<Task[]>(["project-tasks", projectId]);

      const optimisticTask: Task = {
        taskId: `temp-${uuidv4()}`,
        projectId,
        title: newTaskParams.title,
        description: newTaskParams.description,
        assigneeId: newTaskParams.assigneeId,
        status: newTaskParams.status || "todo",
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<Task[]>(["project-tasks", projectId], (old) => {
        if (!old) return [optimisticTask];
        return [optimisticTask, ...old]; // Prepend for visibility
      });

      return { previousTasks };
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["project-tasks", projectId], context.previousTasks);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    },
    onSettled: () => {
      // Background refetch to ensure true consistency with the server DB
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    },
  });
};

/**
 * Updates a task (title, description, assignee, status) with robust optimistic caching.
 */
export const useUpdateTaskMutation = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: UpdateTaskPayload }) => {
      const response = await axiosClient.patch<SingleTaskResponse>(
        `/projects/${projectId}/tasks/${taskId}`,
        updates,
        {
          headers: {
            "X-Idempotency-Key": generateIdempotencyKey("task-update"),
          },
        }
      );
      return response.data.data;
    },
    onMutate: async ({ taskId, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["project-tasks", projectId] });
      const previousTasks = queryClient.getQueryData<Task[]>(["project-tasks", projectId]);

      queryClient.setQueryData<Task[]>(["project-tasks", projectId], (old) => {
        if (!old) return [];
        return old.map((t) =>
          t.taskId === taskId ? ({ ...t, ...updates, updatedAt: new Date().toISOString() } as any) : t
        );
      });

      return { previousTasks };
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["project-tasks", projectId], context.previousTasks);
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["task-events", projectId, variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ["project-activity", projectId] });
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["task-events", projectId, variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ["project-activity", projectId] });
    },
  });
};

/**
 * Soft deletes a task with optimistic caching.
 */
export const useDeleteTaskMutation = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      await axiosClient.delete(`/projects/${projectId}/tasks/${taskId}`, {
        headers: {
          "X-Idempotency-Key": generateIdempotencyKey("task-delete"),
        },
      });
      return taskId;
    },
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: ["project-tasks", projectId] });
      const previousTasks = queryClient.getQueryData<Task[]>(["project-tasks", projectId]);

      queryClient.setQueryData<Task[]>(["project-tasks", projectId], (old) => {
        if (!old) return [];
        return old.filter((t) => t.taskId !== taskId);
      });

      return { previousTasks };
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["project-tasks", projectId], context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    },
  });
};

/**
 * Soft deletes multiple tasks with optimistic caching.
 */
export const useBulkDeleteTasksMutation = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      await axiosClient.delete(`/projects/${projectId}/tasks/bulk`, {
        data: { taskIds },
        headers: {
          "X-Idempotency-Key": generateIdempotencyKey("task-bulk-delete"),
        },
      });
      return taskIds;
    },
    onMutate: async (taskIds) => {
      await queryClient.cancelQueries({ queryKey: ["project-tasks", projectId] });
      const previousTasks = queryClient.getQueryData<Task[]>(["project-tasks", projectId]);

      queryClient.setQueryData<Task[]>(["project-tasks", projectId], (old) => {
        if (!old) return [];
        return old.filter((t) => !taskIds.includes(t.taskId));
      });

      return { previousTasks };
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["project-tasks", projectId], context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-activity", projectId] });
    },
  });
};

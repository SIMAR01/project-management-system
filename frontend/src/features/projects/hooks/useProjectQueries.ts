import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../../api/axiosClient";
import { ProjectWorkspace, ProjectActivityEvent } from "../types/project.types";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

const mapProject = (p: any): ProjectWorkspace => ({
  ...p,
  id: p.projectId,
  ownerId: p.owner,
});

/**
 * Hook to retrieve all projects accessible by the authenticated user.
 */
export const useWorkspacesQuery = () => {
  return useQuery<ProjectWorkspace[]>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const response = await axiosClient.get<ApiResponse<any[]>>("/projects");
      return (response.data.data || []).map(mapProject);
    },
  });
};

/**
 * Hook to retrieve the chronological activity timeline for a workspace.
 */
export const useProjectActivityQuery = (projectId: string, enabled: boolean = true) => {
  return useQuery<ProjectActivityEvent[]>({
    queryKey: ["project-activity", projectId],
    queryFn: async () => {
      const response = await axiosClient.get<ApiResponse<any[]>>(
        `/projects/${projectId}/activity`
      );
      return (response.data.data || []).map((e) => ({
        ...e,
        id: e._id || e.id,
        performedBy: e.actor?.name || e.actor?.username || "System",
      }));
    },
    enabled: !!projectId && enabled,
  });
};

/**
 * Mutation to create a new project workspace with optimistic updates.
 */
export const useCreateWorkspaceMutation = (onSuccessCallback?: () => void) => {
  const queryClient = useQueryClient();

  return useMutation<
    ApiResponse<any>,
    Error,
    { name: string; description?: string },
    { previousWorkspaces: ProjectWorkspace[] | undefined }
  >({
    mutationFn: async (payload) => {
      const response = await axiosClient.post<ApiResponse<any>>("/projects", payload);
      return response.data;
    },
    onMutate: async (newWorkspace) => {
      await queryClient.cancelQueries({ queryKey: ["workspaces"] });
      const previousWorkspaces = queryClient.getQueryData<ProjectWorkspace[]>(["workspaces"]);

      const tempWorkspace: ProjectWorkspace = {
        id: `temp-${Date.now()}`,
        projectId: `temp-${Date.now()}`,
        name: newWorkspace.name,
        description: newWorkspace.description,
        owner: "",
        ownerId: "",
        members: [],
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<ProjectWorkspace[]>(["workspaces"], (old) => {
        if (!old) return [tempWorkspace];
        return [...old, tempWorkspace];
      });

      return { previousWorkspaces };
    },
    onError: (err, newWorkspace, context) => {
      if (context?.previousWorkspaces) {
        queryClient.setQueryData(["workspaces"], context.previousWorkspaces);
      }
    },
    onSuccess: () => {
      if (onSuccessCallback) onSuccessCallback();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
};

/**
 * Mutation to update project details with optimistic updates.
 */
export const useUpdateWorkspaceMutation = (onSuccessCallback?: () => void) => {
  const queryClient = useQueryClient();

  return useMutation<
    ApiResponse<any>,
    Error,
    { projectId: string; name?: string; description?: string },
    { previousWorkspaces: ProjectWorkspace[] | undefined }
  >({
    mutationFn: async ({ projectId, ...payload }) => {
      const response = await axiosClient.put<ApiResponse<any>>(
        `/projects/${projectId}`,
        payload
      );
      return response.data;
    },
    onMutate: async (updatedWorkspace) => {
      await queryClient.cancelQueries({ queryKey: ["workspaces"] });
      const previousWorkspaces = queryClient.getQueryData<ProjectWorkspace[]>(["workspaces"]);

      queryClient.setQueryData<ProjectWorkspace[]>(["workspaces"], (old) => {
        if (!old) return [];
        return old.map((w) =>
          w.projectId === updatedWorkspace.projectId
            ? { ...w, ...updatedWorkspace }
            : w
        );
      });

      return { previousWorkspaces };
    },
    onError: (err, updatedWorkspace, context) => {
      if (context?.previousWorkspaces) {
        queryClient.setQueryData(["workspaces"], context.previousWorkspaces);
      }
    },
    onSuccess: () => {
      if (onSuccessCallback) onSuccessCallback();
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["project-activity", variables.projectId] });
    },
  });
};

/**
 * Mutation to delete a project workspace with optimistic updates.
 */
export const useDeleteWorkspaceMutation = (onSuccessCallback?: () => void) => {
  const queryClient = useQueryClient();

  return useMutation<ApiResponse<any>, Error, string, { previousWorkspaces: ProjectWorkspace[] | undefined }>({
    mutationFn: async (projectId) => {
      const response = await axiosClient.delete<ApiResponse<any>>(`/projects/${projectId}`);
      return response.data;
    },
    onMutate: async (projectId) => {
      await queryClient.cancelQueries({ queryKey: ["workspaces"] });
      const previousWorkspaces = queryClient.getQueryData<ProjectWorkspace[]>(["workspaces"]);

      queryClient.setQueryData<ProjectWorkspace[]>(["workspaces"], (old) => {
        if (!old) return [];
        return old.filter((w) => w.projectId !== projectId);
      });

      return { previousWorkspaces };
    },
    onError: (err, projectId, context) => {
      if (context?.previousWorkspaces) {
        queryClient.setQueryData(["workspaces"], context.previousWorkspaces);
      }
    },
    onSuccess: () => {
      if (onSuccessCallback) onSuccessCallback();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
};

/**
 * Mutation to invite a member to a workspace.
 */
export const useInviteMemberMutation = (onSuccessCallback?: () => void) => {
  const queryClient = useQueryClient();

  return useMutation<
    ApiResponse<any>,
    Error,
    { projectId: string; emailOrUsername: string; role: "ProjectManager" | "TeamMember" }
  >({
    mutationFn: async ({ projectId, emailOrUsername, role }) => {
      const response = await axiosClient.post<ApiResponse<any>>(
        `/projects/${projectId}/invite`,
        { emailOrUsername, role }
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["project-activity", variables.projectId] });
      if (onSuccessCallback) onSuccessCallback();
    },
  });
};

/**
 * Mutation to remove a member from a workspace.
 */
export const useRemoveMemberMutation = (onSuccessCallback?: () => void) => {
  const queryClient = useQueryClient();

  return useMutation<
    ApiResponse<any>,
    Error,
    { projectId: string; userId: string }
  >({
    mutationFn: async ({ projectId, userId }) => {
      const response = await axiosClient.post<ApiResponse<any>>(
        `/projects/${projectId}/remove`,
        { userId }
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["project-activity", variables.projectId] });
      if (onSuccessCallback) onSuccessCallback();
    },
  });
};

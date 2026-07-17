export type TaskStatus = 'todo' | 'inprogress' | 'underreview' | 'done';

export interface Task {
  taskId: string;
  projectId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assignee?: {
    name: string;
    username: string;
    email: string;
  } | null;
  status: TaskStatus;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedTasksResponse {
  statusCode: number;
  data: {
    tasks: Task[];
    pagination: PaginationMeta;
  };
  message: string;
  success: boolean;
}

export interface SingleTaskResponse {
  statusCode: number;
  data: Task;
  message: string;
  success: boolean;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  assigneeId?: string;
  status?: TaskStatus;
}

export interface UpdateTaskStatusPayload {
  status: TaskStatus;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  status?: TaskStatus;
}

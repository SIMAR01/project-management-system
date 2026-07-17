export interface ProjectMember {
  userId: string;
  role: "ProjectManager" | "TeamMember";
  name?: string;
  username?: string;
  email?: string;
}

export interface ProjectWorkspace {
  id: string; // Unified with projectId
  projectId: string; // Kept for backend UUID sync
  name: string;
  description?: string;
  owner: string; // references user.uuid.id
  ownerId: string; // Alias to match prompt exactly
  ownerName?: string;
  ownerUsername?: string;
  ownerEmail?: string;
  members: ProjectMember[];
  isArchived: boolean;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectActivityEvent {
  id: string; // Unified with DB _id
  _id: string; // DB event id
  projectId: string;
  eventType:
    | "PROJECT_CREATED"
    | "PROJECT_UPDATED"
    | "PROJECT_ARCHIVED"
    | "PROJECT_DELETED"
    | "MEMBER_INVITED"
    | "MEMBER_REMOVED"
    | "TASK_CREATED"
    | "STATUS_CHANGED"
    | "TASK_DELETED"
    | "ASSIGNEE_CHANGED"
    | "TASK_UPDATED";
  actorId: string;
  performedBy: string; // Human readable name/username of performer
  actor: {
    name: string;
    username: string;
    email: string;
  };
  timestamp: string;
  payload: any;
}

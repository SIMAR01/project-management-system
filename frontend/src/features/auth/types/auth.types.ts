export type UserRole = 'ProjectManager' | 'TeamMember' | 'User';

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role?: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface Session {
  sessionId: string;
  userId: string;
  ip: string;
  userAgent: string;
  browser: string;
  os: string;
  device: string;
  deviceName?: string; // Maps to browser/device formatted description
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
}

export interface LoginResponseData {
  user: User;
  accessToken: string;
}

export interface RefreshTokenResponseData {
  accessToken: string;
}

export interface LogoutResponseData {
  loggedOutSessions: Array<{
    sessionId: string;
    ip: string;
    browser: string;
    os: string;
    device: string;
  }>;
}

declare namespace Express {
  interface Request {
    // The authenticated user profile attached by the Auth middleware
    user?: Omit<import("../models/user.model").IUser, "password" | "refreshTokens">;
    // The current access token string attached by the Auth middleware (useful for revocation check)
    token?: string;
    // The current project document resolved by RBAC / membership middleware
    project?: import("../models/project.model").IProject;
  }
}


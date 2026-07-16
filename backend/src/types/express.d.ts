import { IUser } from "../models/user.model";

declare global {
  namespace Express {
    interface Request {
      // The authenticated user profile attached by the Auth middleware
      user?: Omit<IUser, "password" | "refreshTokens">;
      // The current access token string attached by the Auth middleware (useful for revocation check)
      token?: string;
    }
  }
}

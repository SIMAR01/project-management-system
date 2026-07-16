import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { verifyAccessToken } from "../utils/jwt";
import { User } from "../models/user.model";
import { redisClient } from "../config/redis";

/**
 * Authentication middleware to protect endpoints.
 * Validates JWT access token and checks Redis blacklist.
 */
export const protect = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    let token: string | undefined;

    // 1. Extract Bearer Token from Authorization Header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    if (!token) {
      throw new ApiError(401, "Not authorized, token missing");
    }

    // 2. Check if token is blacklisted in Redis (e.g. user logged out)
    let isBlacklisted = false;
    try {
      const result = await redisClient.get(`blacklist:${token}`);
      if (result) {
        isBlacklisted = true;
      }
    } catch (redisError) {
      // Log redis connection errors but don't block auth flow in production if cache is down
      console.error("Redis connection error during blacklist check:", redisError);
    }

    if (isBlacklisted) {
      throw new ApiError(401, "Token is invalid (user has logged out)");
    }

    // 3. Verify JWT signature and token expiration
    const decoded = verifyAccessToken(token);

    // 4. Retrieve current user from database by uuid
    const user = await User.findOne({ "uuid.id": decoded.id });
    if (!user) {
      throw new ApiError(401, "User not found");
    }

    // 5. Attach user profile and token to request context
    req.user = user.toObject();
    req.token = token;

    next();
  }
);

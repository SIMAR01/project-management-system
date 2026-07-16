import { Request, Response, NextFunction } from "express";
import { redisClient } from "../config/redis";
import { ApiError } from "../utils/ApiError";

/**
 * Custom Redis-based rate limiting middleware.
 * Restricts requests by IP address to protect auth endpoints.
 */
export const authRateLimiter = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  // Extract client IP address
  const clientIp =
    req.ip ||
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    "anonymous";

  const key = `rate-limit:auth:${clientIp}`;
  const LIMIT = 100; // Limit of requests
  const WINDOW_SECONDS = 15 * 60; // 15-minute sliding/fixed window

  try {
    // Increment request count in Redis
    const currentCount = await redisClient.incr(key);

    // If it's the first request in the window, set TTL
    if (currentCount === 1) {
      await redisClient.expire(key, WINDOW_SECONDS);
    }

    // If limit is exceeded, return 429 error
    if (currentCount > LIMIT) {
      throw new ApiError(429, "Too many requests. Please try again after 15 minutes.");
    }

    next();
  } catch (error) {
    next(error);
  }
};

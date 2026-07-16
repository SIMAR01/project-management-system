import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { AuthService } from "../services/auth.service";
import {
  COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_EXPIRY_MS,
} from "../utils/constants";
import { verifyRefreshToken } from "../utils/jwt";

/**
 * Utility helper to extract a specific cookie value from the request headers
 * without requiring the third-party cookie-parser middleware.
 */
const getCookieValue = (req: Request, cookieName: string): string | undefined => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === cookieName) {
      return value;
    }
  }
  return undefined;
};

export class AuthController {
  /**
   * Handler for POST /register
   */
  public static register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = await AuthService.registerUser(req.body);

    res.status(201).json(
      new ApiResponse(201, user, "User registered successfully")
    );
  });

  /**
   * Handler for POST /login
   */
  public static login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { emailOrUsername, password } = req.body;

    let ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    if (ip.startsWith("::ffff:")) {
      ip = ip.slice(7);
    }
    const userAgent = req.headers["user-agent"] || "unknown";

    const { user, accessToken, plainRefreshToken } = await AuthService.loginUser(
      emailOrUsername,
      password,
      ip,
      userAgent
    );

    // Set Refresh Token as HTTP-only cookie with designated 7 days lifespan
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, plainRefreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_EXPIRY_MS,
    });

    res.status(200).json(
      new ApiResponse(200, { user, accessToken }, "Login successful")
    );
  });

  /**
   * Handler for POST /refresh-token
   */
  public static refreshToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const refreshToken = getCookieValue(req, REFRESH_TOKEN_COOKIE_NAME);

    if (!refreshToken) {
      throw new ApiError(401, "Refresh token is missing");
    }

    let ip = req.ip || req.headers["x-forwarded-for"]?.toString();
    if (ip && ip.startsWith("::ffff:")) {
      ip = ip.slice(7);
    }
    const userAgent = req.headers["user-agent"];

    const { accessToken, newPlainRefreshToken } = await AuthService.refreshUserTokens(
      refreshToken,
      ip,
      userAgent
    );

    // Rotate/Reset cookie with new plain refresh token
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, newPlainRefreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_EXPIRY_MS,
    });

    res.status(200).json(
      new ApiResponse(
        200,
        { accessToken },
        "Access token refreshed successfully"
      )
    );
  });

  /**
   * Handler for POST /logout
   */
  public static logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.uuid?.id;
    const token = req.token;
    const plainRefreshToken = getCookieValue(req, REFRESH_TOKEN_COOKIE_NAME);

    if (!userId) {
      throw new ApiError(401, "User session not active");
    }

    const { all, sessionId } = req.body || {};

    // Revoke tokens in DB, clear active session in Redis, and blacklist Access Token in Redis
    const { loggedOutSessions } = await AuthService.logoutUser({
      userId,
      accessToken: token,
      plainRefreshToken,
      sessionIdToLogout: sessionId,
      logoutAll: all === true,
    });

    // Determine if we are logging out a different device/session
    let isLoggingOutDifferentSession = false;
    if (sessionId) {
      try {
        if (plainRefreshToken) {
          const decoded = verifyRefreshToken(plainRefreshToken);
          if (decoded.sessionId !== sessionId) {
            isLoggingOutDifferentSession = true;
          }
        }
      } catch (err) {
        // If current refresh token is invalid/expired, we proceed with clearing cookie anyway
      }
    }

    // Clear HTTP-only cookie if we logged out the current session or all sessions
    if (!isLoggingOutDifferentSession) {
      res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, COOKIE_OPTIONS);
    }

    res.status(200).json(
      new ApiResponse(200, { loggedOutSessions }, "Logout successful")
    );
  });

  /**
   * Handler for GET /me
   */
  public static me = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.uuid?.id;

    if (!userId) {
      throw new ApiError(401, "User not authenticated");
    }

    const user = await AuthService.getCurrentUser(userId);

    res.status(200).json(
      new ApiResponse(200, user, "User profile fetched successfully")
    );
  });

  /**
   * Handler for GET /sessions
   */
  public static getSessions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.uuid?.id;

    if (!userId) {
      throw new ApiError(401, "User not authenticated");
    }

    const plainRefreshToken = getCookieValue(req, REFRESH_TOKEN_COOKIE_NAME);
    let currentSessionId: string | undefined;

    if (plainRefreshToken) {
      try {
        const decoded = verifyRefreshToken(plainRefreshToken);
        currentSessionId = decoded.sessionId;
      } catch (err) {
        // Suppress verification errors (e.g. expired refresh token)
      }
    }

    const sessions = await AuthService.getActiveSessions(userId, currentSessionId);

    res.status(200).json(
      new ApiResponse(200, sessions, "Active sessions retrieved successfully")
    );
  });
}

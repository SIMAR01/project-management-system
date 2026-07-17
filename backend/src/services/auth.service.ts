import crypto from "crypto";
import jwt from "jsonwebtoken";
import { User, IUser } from "../models/user.model";
import { comparePassword, hashPassword } from "../utils/password";
import { ApiError } from "../utils/ApiError";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { redisClient } from "../config/redis";
import { parseUserAgent } from "../utils/userAgent";

export class AuthService {
  /**
   * Registers a new user.
   */
  public static async registerUser(userData: Partial<IUser>): Promise<Omit<IUser, "password" | "refreshTokens">> {
    const { name, username, email, password } = userData;
    console.log(userData, ' ---userData')
    if (!name || !username || !email || !password) {
      throw new ApiError(400, "All fields are required");
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.toLowerCase().trim();

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
    });

    if (existingUser) {
      throw new ApiError(409, "User with this email or username already exists");
    }

    const user = new User({
      name,
      username: normalizedUsername,
      email: normalizedEmail,
      password,
    });

    await user.save();

    const userJson = user.toObject();
    delete (userJson as any).password;
    delete (userJson as any).refreshTokens;

    return userJson;
  }

  /**
   * Log in user, generating tokens and caching the active session in Redis.
   */
  public static async loginUser(
    emailOrUsername: string,
    password: string,
    ip: string = "unknown",
    userAgent: string = "unknown"
  ): Promise<{
    user: { id: string; name: string; username: string; email: string };
    accessToken: string;
    plainRefreshToken: string;
  }> {
    const queryTerm = emailOrUsername.toLowerCase().trim();

    const user = await User.findOne({
      $or: [{ email: queryTerm }, { username: queryTerm }],
    }).select("+password +refreshTokens");

    if (!user) {
      throw new ApiError(401, "Invalid email/username or password");
    }

    const isPasswordMatch = await comparePassword(password, user.password);
    if (!isPasswordMatch) {
      throw new ApiError(401, "Invalid email/username or password");
    }

    const userId = user.uuid.id;
    const sessionId = crypto.randomUUID();

    // Generate tokens
    const accessToken = generateAccessToken({
      id: userId,
      email: user.email,
      username: user.username,
    });
    const plainRefreshToken = generateRefreshToken({ id: userId, sessionId });

    // Store active refresh token in Redis with metadata: key format is session:userId:sessionId (7 days TTL)
    const sessionKey = `session:${userId}:${sessionId}`;
    const parsedUA = parseUserAgent(userAgent);
    const sessionData = {
      sessionId,
      userId,
      ip,
      userAgent,
      browser: parsedUA.browser,
      os: parsedUA.os,
      device: parsedUA.device,
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      refreshToken: plainRefreshToken,
    };

    await redisClient.set(sessionKey, JSON.stringify(sessionData), {
      EX: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    // Also persist hashed refresh token in MongoDB as fallback
    const hashed = await hashPassword(plainRefreshToken);
    if (!user.refreshTokens) {
      user.refreshTokens = [];
    }
    user.refreshTokens.push(hashed);

    // Limit active sessions to 10
    if (user.refreshTokens.length > 10) {
      user.refreshTokens.shift();
    }

    await user.save();

    return {
      user: {
        id: userId,
        name: user.name,
        username: user.username,
        email: user.email,
      },
      accessToken,
      plainRefreshToken,
    };
  }

  /**
   * Refreshes access and refresh tokens using Redis-cached sessions, with MongoDB fallback.
   */
  public static async refreshUserTokens(
    plainRefreshToken: string,
    ip?: string,
    userAgent?: string
  ): Promise<{
    accessToken: string;
    newPlainRefreshToken: string;
  }> {
    // 1. Verify token signature statelessly
    const decoded = verifyRefreshToken(plainRefreshToken);
    const userId = decoded.id;
    const sessionId = decoded.sessionId;

    // 2. Check session in Redis
    const sessionKey = `session:${userId}:${sessionId}`;
    let sessionData: any = null;
    const sessionExists = await redisClient.get(sessionKey);

    if (sessionExists) {
      try {
        sessionData = JSON.parse(sessionExists);
      } catch (err) {
        console.error("Failed to parse Redis session data:", err);
      }
    }

    // 3. Fallback: if not in Redis or token doesn't match, check MongoDB
    const user = await User.findOne({ "uuid.id": userId }).select("+refreshTokens");
    if (!user) {
      throw new ApiError(401, "User no longer exists");
    }

    let tokenMatched = false;
    let oldHashedTokenMatched = "";

    if (sessionData && sessionData.refreshToken === plainRefreshToken) {
      tokenMatched = true;
    } else {
      // Redis missed or token didn't match: check DB fallback
      if (user.refreshTokens && user.refreshTokens.length > 0) {
        for (const hashedToken of user.refreshTokens) {
          if (await comparePassword(plainRefreshToken, hashedToken)) {
            tokenMatched = true;
            oldHashedTokenMatched = hashedToken;
            break;
          }
        }
      }
    }

    if (!tokenMatched) {
      // If the session was active in Redis but the token did not match, it's a potential reuse attack
      if (sessionExists) {
        // Security warning: possible token reuse, clear all sessions as precaution
        user.refreshTokens = [];
        await user.save();

        // Scan and delete all sessions from Redis
        const pattern = `session:${userId}:*`;
        let cursor = "0";
        do {
          const reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
          cursor = reply.cursor;
          const keys = reply.keys;
          if (keys.length > 0) {
            await redisClient.del(keys);
          }
        } while (cursor !== "0");

        throw new ApiError(401, "Invalid session state detected / potential reuse warning");
      }

      // If the session didn't exist at all, it was just evicted / logged out
      throw new ApiError(401, "Session has been logged out or evicted");
    }

    // 4. Generate rotated tokens (maintaining the same sessionId)
    const accessToken = generateAccessToken({
      id: userId,
      email: user.email,
      username: user.username,
    });
    const newPlainRefreshToken = generateRefreshToken({ id: userId, sessionId });

    // 5. Update/Save session in Redis
    const parsedUA = parseUserAgent(userAgent || (sessionData?.userAgent));
    const updatedSessionData = {
      sessionId,
      userId,
      ip: ip || (sessionData?.ip || "unknown"),
      userAgent: userAgent || (sessionData?.userAgent || "unknown"),
      browser: parsedUA.browser,
      os: parsedUA.os,
      device: parsedUA.device,
      lastActive: new Date().toISOString(),
      createdAt: sessionData?.createdAt || new Date().toISOString(),
      refreshToken: newPlainRefreshToken
    };

    await redisClient.set(sessionKey, JSON.stringify(updatedSessionData), {
      EX: 7 * 24 * 60 * 60, // 7 days
    });

    // 6. Update fallback DB token
    const newHashedToken = await hashPassword(newPlainRefreshToken);
    if (!user.refreshTokens) {
      user.refreshTokens = [];
    }

    // Replace old hashed token
    if (oldHashedTokenMatched) {
      const idx = user.refreshTokens.indexOf(oldHashedTokenMatched);
      if (idx !== -1) {
        user.refreshTokens[idx] = newHashedToken;
      } else {
        user.refreshTokens.push(newHashedToken);
      }
    } else {
      let replaced = false;
      for (let i = 0; i < user.refreshTokens.length; i++) {
        if (await comparePassword(plainRefreshToken, user.refreshTokens[i])) {
          user.refreshTokens[i] = newHashedToken;
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        user.refreshTokens.push(newHashedToken);
      }
    }

    // Keep active sessions limited to 10
    if (user.refreshTokens.length > 10) {
      user.refreshTokens.shift();
    }

    user.markModified("refreshTokens");
    await user.save();

    return {
      accessToken,
      newPlainRefreshToken,
    };
  }

  /**
   * Log out user, removing session key(s) from Redis and optionally blacklisting the Access Token.
   * Returns details of all sessions that were logged out.
   */
  public static async logoutUser(options: {
    userId: string;
    accessToken?: string;
    plainRefreshToken?: string;
    sessionIdToLogout?: string | null;
    logoutAll?: boolean;
  }): Promise<{
    loggedOutSessions: Array<{
      sessionId: string;
      ip: string;
      browser: string;
      os: string;
      device: string;
    }>;
  }> {
    const { userId, accessToken, plainRefreshToken, sessionIdToLogout, logoutAll } = options;

    const user = await User.findOne({ "uuid.id": userId }).select("+refreshTokens");
    const loggedOutSessions: any[] = [];

    if (logoutAll) {
      // 1. Scan and delete all Redis sessions
      const pattern = `session:${userId}:*`;
      let cursor = "0";
      const keysToDelete: string[] = [];
      do {
        const reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = reply.cursor;
        const keys = reply.keys;
        if (keys.length > 0) {
          keysToDelete.push(...keys);
        }
      } while (cursor !== "0");

      if (keysToDelete.length > 0) {
        const values = await redisClient.mGet(keysToDelete);
        for (const val of values) {
          if (val) {
            try {
              const session = JSON.parse(val);
              const { refreshToken, ...publicSession } = session;
              loggedOutSessions.push(publicSession);
            } catch (err) {
              console.error("Error parsing session data during logout-all:", err);
            }
          }
        }
        await redisClient.del(keysToDelete);
      }

      // 2. Clear all refresh tokens in MongoDB
      if (user) {
        user.refreshTokens = [];
        await user.save();
      }
    } else if (sessionIdToLogout !== undefined) {
      // Logout a specific session by ID
      const sessionKey = `session:${userId}:${sessionIdToLogout}`;
      const sessionDataStr = sessionIdToLogout ? await redisClient.get(sessionKey) : null;

      if (!sessionDataStr) {
        throw new ApiError(400, "Session ID is not valid for this user");
      }

      // Delete from Redis
      await redisClient.del(sessionKey);

      // Extract matching token to delete from DB
      try {
        const sessionData = JSON.parse(sessionDataStr);
        const { refreshToken: tokenToRevoke, ...publicSession } = sessionData;
        loggedOutSessions.push(publicSession);

        if (user && user.refreshTokens) {
          const filteredTokens: string[] = [];
          for (const hashedToken of user.refreshTokens) {
            if (!(await comparePassword(tokenToRevoke, hashedToken))) {
              filteredTokens.push(hashedToken);
            }
          }
          user.refreshTokens = filteredTokens;
          user.markModified("refreshTokens");
          await user.save();
        }
      } catch (err) {
        console.error("Error parsing session data during specific logout:", err);
      }
    } else if (plainRefreshToken) {
      // Logout current session using the refresh token
      let sessionId: string | undefined;
      try {
        const decoded = verifyRefreshToken(plainRefreshToken);
        sessionId = decoded.sessionId;
      } catch (err) {
        console.error("Error decoding refresh token during current logout:", err);
      }

      if (sessionId) {
        const sessionKey = `session:${userId}:${sessionId}`;
        const sessionDataStr = await redisClient.get(sessionKey);
        await redisClient.del(sessionKey);

        if (sessionDataStr) {
          try {
            const sessionData = JSON.parse(sessionDataStr);
            const { refreshToken, ...publicSession } = sessionData;
            loggedOutSessions.push(publicSession);
          } catch (err) {
            console.error("Error parsing session data during current logout:", err);
          }
        }
      }

      // Remove from MongoDB
      if (user && user.refreshTokens) {
        const filteredTokens: string[] = [];
        for (const hashedToken of user.refreshTokens) {
          if (!(await comparePassword(plainRefreshToken, hashedToken))) {
            filteredTokens.push(hashedToken);
          }
        }
        user.refreshTokens = filteredTokens;
        user.markModified("refreshTokens");
        await user.save();
      }
    }

    // Determine if we should blacklist the current access token
    let shouldBlacklistCurrent = true;
    if (sessionIdToLogout && plainRefreshToken) {
      try {
        const decoded = verifyRefreshToken(plainRefreshToken);
        if (decoded.sessionId !== sessionIdToLogout) {
          shouldBlacklistCurrent = false;
        }
      } catch (err) {
        // If current refresh token is invalid, blacklist anyway
      }
    }

    // 3. Blacklist current Access Token in Redis
    if (accessToken && shouldBlacklistCurrent) {
      try {
        const decoded = jwt.decode(accessToken) as { exp?: number };
        if (decoded && decoded.exp) {
          const remainingSeconds = decoded.exp - Math.floor(Date.now() / 1000);
          if (remainingSeconds > 0) {
            const blacklistKey = `blacklist:${accessToken}`;
            await redisClient.set(blacklistKey, "true", {
              EX: remainingSeconds,
            });
          }
        }
      } catch (error) {
        console.error("Failed to store access token in Redis blacklist:", error);
      }
    }


    return {
      loggedOutSessions,
    };
  }

  public static async getCurrentUser(userId: string): Promise<Omit<IUser, "password" | "refreshTokens">> {
    const user = await User.findOne({ "uuid.id": userId });
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return user.toObject();
  }

  /**
   * Retrieves all active sessions for the user from Redis.
   */
  public static async getActiveSessions(
    userId: string,
    currentSessionId?: string
  ): Promise<any[]> {
    const pattern = `session:${userId}:*`;
    const sessions: any[] = [];
    let cursor = "0";

    do {
      const reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor;
      const keys = reply.keys;

      if (keys.length > 0) {
        const values = await redisClient.mGet(keys);
        for (let i = 0; i < keys.length; i++) {
          const value = values[i];
          if (value) {
            try {
              const session = JSON.parse(value);
              const { refreshToken, ...publicSession } = session;
              sessions.push({
                ...publicSession,
                isCurrent: session.sessionId === currentSessionId,
              });
            } catch (err) {
              console.error("Failed to parse session data from Redis:", err);
            }
          }
        }
      }
    } while (cursor !== "0");

    return sessions.sort(
      (a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
    );
  }
}

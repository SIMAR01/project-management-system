import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } from "./constants";
import { ApiError } from "./ApiError";

// Ensure the JWT_SECRET is loaded
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is missing!");
}

export interface UserTokenPayload {
  id: string;
  email: string;
  username: string;
}

export interface RefreshTokenPayload {
  id: string;
  sessionId: string;
}

/**
 * Generates an Access Token.
 * Expiry: 15 minutes.
 */
export const generateAccessToken = (payload: UserTokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
};

/**
 * Generates a Refresh Token.
 * Expiry: 7 days.
 */
export const generateRefreshToken = (payload: RefreshTokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
};

/**
 * Verifies an Access Token.
 * Throws ApiError if token is invalid or expired.
 */
export const verifyAccessToken = (token: string): UserTokenPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as UserTokenPayload;
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      throw new ApiError(401, "Access token has expired");
    }
    throw new ApiError(401, "Invalid access token");
  }
};

/**
 * Verifies a Refresh Token.
 * Throws ApiError if token is invalid or expired.
 */
export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as RefreshTokenPayload;
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      throw new ApiError(401, "Refresh token has expired");
    }
    throw new ApiError(401, "Invalid refresh token");
  }
};

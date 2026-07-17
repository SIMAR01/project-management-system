import { CookieOptions } from "express";

/**
 * Cookie options for setting HTTP-only refresh tokens.
 * Secure flag is active only in production to allow local testing over HTTP.
 */
export const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
};

/**
 * Cookie name used to store the Refresh Token.
 */
export const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

/**
 * Expiration times for JWTs.
 */
export const ACCESS_TOKEN_EXPIRY = "4h"; // 4 hours
export const REFRESH_TOKEN_EXPIRY = "7d";   // 7 days
export const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

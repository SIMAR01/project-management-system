import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { redisClient } from "../config/redis";
import { ApiError } from "../utils/ApiError";

/**
 * Recursively and deterministically sorts object keys to ensure consistent JSON stringification
 * regardless of key ordering in the request payload.
 */
const getDeterministicBodyHash = (body: any): string => {
  if (!body || typeof body !== "object") {
    return crypto.createHash("sha256").update(JSON.stringify(body || {})).digest("hex");
  }

  const sortKeys = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(sortKeys);
    } else if (obj !== null && typeof obj === "object") {
      return Object.keys(obj)
        .sort()
        .reduce((result: any, key: string) => {
          result[key] = sortKeys(obj[key]);
          return result;
        }, {});
    }
    return obj;
  };

  const sortedBody = sortKeys(body);
  return crypto.createHash("sha256").update(JSON.stringify(sortedBody)).digest("hex");
};

/**
 * Production-grade Idempotency Middleware.
 * Prevents execution of duplicate mutating operations (POST/PUT/DELETE) using the
 * "Unified Response Envelope Strategy" in Redis.
 */
export const idempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const key = req.headers["x-idempotency-key"];

  // Skip idempotency validation if the header is not provided
  if (!key) {
    return next();
  }

  const idempotencyKey = Array.isArray(key) ? key[0] : key;

  // Extract path excluding any query parameters
  const urlPath = req.originalUrl.split("?")[0];
  const userId = req.user?.uuid?.id || "anonymous";
  const method = req.method;

  // Key structure: idempotency:{userId}:{method}:{path}:{key}
  const redisKey = `idempotency:${userId}:${method}:${urlPath}:${idempotencyKey}`;

  // Deterministically hash request payload to detect tampering
  const currentBodyHash = getDeterministicBodyHash(req.body);

  try {
    const cachedRecord = await redisClient.get(redisKey);

    if (cachedRecord) {
      const { bodyHash, statusCode, responseBody } = JSON.parse(cachedRecord);

      // Validate body integrity
      if (bodyHash === currentBodyHash) {
        console.log(`[Idempotency] Cache hit for key: ${redisKey}`);
        res.status(statusCode).json(responseBody);
        return;
      } else {
        console.warn(`[Idempotency] Payload mismatch for key: ${redisKey}`);
        return next(new ApiError(400, "Idempotency Key conflict: Request payload has changed."));
      }
    }
  } catch (error) {
    console.error("[Idempotency] Failed to retrieve record from Redis:", error);
    // Non-blocking: fail-open in case of caching reading errors to preserve api availability
  }

  // Intercept the res.json method to capture response footprint
  const originalJson = res.json;

  res.json = function (bodyData: any): Response {
    // Only cache successful status codes (rejecting 5xx server errors)
    if (res.statusCode < 500) {
      const responseEnvelope = {
        bodyHash: currentBodyHash,
        statusCode: res.statusCode,
        responseBody: bodyData,
      };

      // Asynchronously store envelope in Redis with a 5-minute (300s) TTL
      redisClient
        .set(redisKey, JSON.stringify(responseEnvelope), { EX: 300 })
        .then(() => {
          console.log(`[Idempotency] Cached response footprint for key: ${redisKey}`);
        })
        .catch((err) => {
          console.error(`[Idempotency] Failed to store record in Redis:`, err);
        });
    }

    // Call the original res.json function
    return originalJson.call(this, bodyData);
  };

  next();
};

import { redisClient } from "../config/redis";

/**
 * Executes a service operation wrapped with idempotency key protection.
 * If the key exists, retrieves the cached result. Otherwise, executes the action,
 * caches the result in Redis with a TTL of 120 seconds, and returns it.
 *
 * @param key The unique idempotency key (X-Idempotency-Key). If falsy, executes action normally.
 * @param action The asynchronous operation to perform.
 * @param ttl Time-to-live in seconds for the idempotency cache (default 120s / 2min).
 */
export async function withIdempotency<T>(
  key: string | undefined,
  action: () => Promise<T>,
  ttl: number = 120
): Promise<T> {
  if (!key) {
    return action();
  }

  const cacheKey = `idempotency:${key}`;

  try {
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log(`[Idempotency] Cache hit for key: ${key}`);
      return JSON.parse(cachedData) as T;
    }
  } catch (error) {
    console.error("[Idempotency] Failed to read from Redis cache:", error);
  }

  // Execute the underlying action
  const result = await action();

  try {
    // Cache the result for subsequent duplicate requests
    await redisClient.set(cacheKey, JSON.stringify(result), {
      EX: ttl,
    });
    console.log(`[Idempotency] Cached response for key: ${key}`);
  } catch (error) {
    console.error("[Idempotency] Failed to write to Redis cache:", error);
  }

  return result;
}

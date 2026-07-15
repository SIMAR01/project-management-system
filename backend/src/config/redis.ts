import { createClient } from "redis";

export const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on("connect", () => {
  console.log("Connecting to Redis...");
});

redisClient.on("ready", () => {
  console.log("Redis is ready");
});

redisClient.on("error", (error) => {
  console.error("Redis Error:", error.message);
});

redisClient.on("reconnecting", () => {
  console.log("Reconnecting to Redis...");
});

redisClient.on("end", () => {
  console.log("Redis connection closed");
});

export const connectRedis = async (): Promise<void> => {
  try {
    await redisClient.connect();

    console.log("Redis Connected");
  } catch (error) {
    console.error("Failed to connect to Redis");

    if (error instanceof Error) {
      console.error(error.message);
    }
    // Exit the process with a non-zero status code to indicate failure before api fails
    process.exit(1);
  }
};
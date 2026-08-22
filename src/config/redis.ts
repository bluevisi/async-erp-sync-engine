import "dotenv/config";
import Redis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? "6379", 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

// Shared Redis connection for BullMQ — maxRetriesPerRequest must be null per BullMQ requirements
export const redisConnection = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
});

redisConnection.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

redisConnection.on("connect", () => {
  console.info(`[Redis] Connected to ${REDIS_HOST}:${REDIS_PORT}`);
});

export default redisConnection;

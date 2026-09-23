import { Redis } from "@upstash/redis";
import type { RedisLike } from "./rateLimiter.js";

/**
 * Builds a Redis client from environment variables, or returns null if
 * they're not set.
 *
 * Rate limiting is opt-in: this backend works fine without it (as it
 * always has), and only starts enforcing a limit once both Upstash
 * variables are present. That keeps existing deployments that haven't
 * set up Upstash yet working exactly as before, rather than breaking on
 * upgrade.
 */
export function getRedisClientFromEnv(): RedisLike | null {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
}

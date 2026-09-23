/**
 * Deterministic, framework-independent rate limiting logic.
 *
 * This is a fixed-window counter keyed on whatever identifier the caller
 * supplies (in practice, the requester's IP — see api/nl-to-sql.ts). The
 * actual storage is injected as a small `RedisLike` interface rather than
 * importing an Upstash client directly, so this logic can be unit tested
 * with an in-memory fake and never needs a real network call in tests.
 *
 * Deliberately simple (INCR + EXPIRE) rather than a sliding-window
 * algorithm: good enough to stop a runaway script or bot from burning
 * through the Gemini free-tier quota, which is the actual threat this
 * guards against (see README's "What this deliberately does NOT do").
 */

export interface RedisLike {
  /** Atomically increments the key by 1 and returns the new value. */
  incr(key: string): Promise<number>;
  /** Sets a TTL (in seconds) on the key. Only called right after the key is first created. */
  expire(key: string, seconds: number): Promise<unknown>;
}

export interface RateLimitConfig {
  /** Max requests allowed per window, per key. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Requests remaining in the current window; never negative. */
  remaining: number;
  /** Window length, echoed back for building a Retry-After-style header. */
  windowSeconds: number;
}

/**
 * Checks and records one request against the limit for `key`.
 *
 * Every call counts, including calls that end up over the limit — a
 * caller who keeps hammering the endpoint after being rejected doesn't
 * get a free pass once the window resets on someone else's request.
 */
export async function checkRateLimit(
  redis: RedisLike,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const count = await redis.incr(key);

  // Only the request that actually creates the key sets its expiry, so
  // the window is anchored to the first request in it, not renewed by
  // every subsequent one.
  if (count === 1) {
    await redis.expire(key, config.windowSeconds);
  }

  return {
    allowed: count <= config.limit,
    limit: config.limit,
    remaining: Math.max(0, config.limit - count),
    windowSeconds: config.windowSeconds,
  };
}

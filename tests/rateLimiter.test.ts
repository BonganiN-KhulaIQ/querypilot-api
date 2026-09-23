import { describe, expect, it } from "vitest";
import { checkRateLimit, type RedisLike } from "../src/rateLimiter";

/** In-memory fake standing in for Upstash Redis, so no network call happens in tests. */
class FakeRedis implements RedisLike {
  private counts = new Map<string, number>();

  async incr(key: string): Promise<number> {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }

  async expire(): Promise<unknown> {
    return true;
  }
}

describe("checkRateLimit", () => {
  it("allows requests under the limit", async () => {
    const redis = new FakeRedis();
    const result = await checkRateLimit(redis, "ip:1", { limit: 3, windowSeconds: 60 });
    expect(result).toEqual({ allowed: true, limit: 3, remaining: 2, windowSeconds: 60 });
  });

  it("allows the request that exactly hits the limit", async () => {
    const redis = new FakeRedis();
    await checkRateLimit(redis, "ip:1", { limit: 2, windowSeconds: 60 });
    const result = await checkRateLimit(redis, "ip:1", { limit: 2, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("rejects requests once the limit is exceeded", async () => {
    const redis = new FakeRedis();
    await checkRateLimit(redis, "ip:1", { limit: 2, windowSeconds: 60 });
    await checkRateLimit(redis, "ip:1", { limit: 2, windowSeconds: 60 });
    const result = await checkRateLimit(redis, "ip:1", { limit: 2, windowSeconds: 60 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("keeps rejecting a caller who keeps hammering past the limit", async () => {
    const redis = new FakeRedis();
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(redis, "ip:1", { limit: 2, windowSeconds: 60 });
    }
    const result = await checkRateLimit(redis, "ip:1", { limit: 2, windowSeconds: 60 });
    expect(result.allowed).toBe(false);
  });

  it("tracks separate keys independently", async () => {
    const redis = new FakeRedis();
    await checkRateLimit(redis, "ip:1", { limit: 1, windowSeconds: 60 });
    const resultForOtherIp = await checkRateLimit(redis, "ip:2", { limit: 1, windowSeconds: 60 });
    expect(resultForOtherIp.allowed).toBe(true);
  });

  it("calls expire only on the request that creates the key", async () => {
    let expireCalls = 0;
    const counts = new Map<string, number>();
    const redis: RedisLike = {
      async incr(key: string) {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      },
      async expire() {
        expireCalls++;
        return true;
      },
    };

    await checkRateLimit(redis, "ip:1", { limit: 5, windowSeconds: 60 });
    await checkRateLimit(redis, "ip:1", { limit: 5, windowSeconds: 60 });
    await checkRateLimit(redis, "ip:1", { limit: 5, windowSeconds: 60 });

    expect(expireCalls).toBe(1);
  });
});

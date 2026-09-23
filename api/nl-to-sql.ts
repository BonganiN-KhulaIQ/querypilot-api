import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleNlToSqlRequest, BadRequestError } from "../src/nlToSqlHandler";
import { checkRateLimit, type RateLimitConfig } from "../src/rateLimiter";
import { getRedisClientFromEnv } from "../src/rateLimitClient";

/**
 * POST /api/nl-to-sql — thin HTTP adapter only. All real logic lives in
 * src/nlToSqlHandler.ts (+ geminiClient.ts, sqlSafety.ts, rateLimiter.ts),
 * which are framework-independent and unit tested directly.
 *
 * CORS is open (Access-Control-Allow-Origin: *) because the caller is a
 * static site hosted elsewhere (e.g. DeepSite), not this same origin.
 * Tighten this to a specific origin once you know your deployed site's
 * URL, by replacing "*" below.
 *
 * ABOUT THE x-app-key CHECK: this is a casual speed bump against
 * accidental/automated abuse of a publicly-known endpoint URL, NOT real
 * security. Since the caller is a static site's client-side JavaScript,
 * whatever key it sends is visible to anyone who looks at that site's
 * network requests or source. Don't rely on this to stop a motivated
 * abuser — the rate limiter below is what actually protects the Gemini
 * quota.
 *
 * RATE LIMITING: enforced per IP via Upstash Redis, if UPSTASH_REDIS_REST_URL
 * and UPSTASH_REDIS_REST_TOKEN are set (see README). If they're not set, or
 * Upstash itself errors, this fails OPEN — the request is allowed through —
 * because a rate limiter outage should never take the whole endpoint down
 * with it.
 */
const RATE_LIMIT_CONFIG: RateLimitConfig = {
  limit: Number(process.env["RATE_LIMIT_MAX"] ?? 20),
  windowSeconds: Number(process.env["RATE_LIMIT_WINDOW_SECONDS"] ?? 600),
};

function getClientIp(req: VercelRequest): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const ip = first?.split(",")[0]?.trim();
  return ip || req.socket?.remoteAddress || "unknown";
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-app-key");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const appKey = process.env["APP_SHARED_SECRET"];
  if (appKey && req.headers["x-app-key"] !== appKey) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ ok: false, error: "Server is not configured (missing API key)." });
    return;
  }

  const redis = getRedisClientFromEnv();
  if (redis) {
    try {
      const ip = getClientIp(req);
      const rateLimit = await checkRateLimit(redis, `ratelimit:nl-to-sql:${ip}`, RATE_LIMIT_CONFIG);

      res.setHeader("X-RateLimit-Limit", String(rateLimit.limit));
      res.setHeader("X-RateLimit-Remaining", String(rateLimit.remaining));

      if (!rateLimit.allowed) {
        res.setHeader("Retry-After", String(rateLimit.windowSeconds));
        res.status(429).json({
          ok: false,
          error: "Too many requests. Please wait a bit before trying again.",
        });
        return;
      }
    } catch (err) {
      // Fail open: a rate-limiter outage should degrade to "no rate
      // limiting", never to "the endpoint is down".
      console.error("Rate limit check failed, allowing request through:", err);
    }
  }

  try {
    const result = await handleNlToSqlRequest(req.body, apiKey);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof BadRequestError) {
      res.status(400).json({ ok: false, error: err.message });
      return;
    }
    res.status(500).json({ ok: false, error: "Something went wrong generating that query." });
  }
}

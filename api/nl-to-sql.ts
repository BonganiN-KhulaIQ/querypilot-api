import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleNlToSqlRequest, BadRequestError } from "../src/nlToSqlHandler";

/**
 * POST /api/nl-to-sql — thin HTTP adapter only. All real logic lives in
 * src/nlToSqlHandler.ts (+ claudeClient.ts, sqlSafety.ts), which are
 * framework-independent and unit tested directly.
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
 * abuser — it only raises the bar above "nothing at all". Real protection
 * for a public-facing version of this would be a proper rate limiter
 * (e.g. Upstash) keyed on IP, which isn't implemented here yet.
 */
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

# querypilot-api

A small, standalone backend that turns a plain-English question into a safe, read-only SQL query.
It exists for exactly one reason: doing that translation requires calling an LLM with a secret API
key, and a secret can never live in a static site's browser-visible code (like the QueryPilot
site built on DeepSite). This backend holds that key and does the translation; the actual query
still runs entirely in the browser, against the user's own data, via sql.js — this backend never
sees or touches the user's real data rows, only the table's column structure and the English
question.

Uses Google's Gemini API (`gemini-2.5-flash`), chosen specifically because Google AI Studio offers
a genuine free tier — no card required to start, unlike Anthropic's API.

## How it works

```
browser (DeepSite site)
  -> POST /api/nl-to-sql { question, schema }
       -> Gemini, forced function call -> { sql } or { error }
       -> deterministic safety gate (src/sqlSafety.ts): reject anything that
          isn't a single, read-only SELECT statement — no matter what the
          model returned, and no matter how the question was phrased.
  <- { ok: true, sql } or { ok: false, error }
browser runs the returned SQL locally via sql.js against the real data
```

The safety gate is the important part. The LLM's output is never trusted on its own: even a
successfully-generated, well-formed `DROP TABLE ...` from a manipulated or misbehaving model is
caught and rejected before it's ever sent back to the browser — the client only ever sees a
generic "didn't pass a safety check" message, never the dangerous SQL itself. This is tested
directly in `tests/nlToSqlHandler.test.ts` by simulating exactly that scenario.

## Project layout

- `src/sqlSafety.ts` — the deterministic safety gate (framework-independent, pure function).
- `src/geminiClient.ts` — calls the Gemini API with a forced function call, so the response is
  always structured data, never free text that needs fragile parsing.
- `src/nlToSqlHandler.ts` — ties it together: validate request → call Gemini → safety-gate the
  result → return. Framework-independent, directly unit tested.
- `api/nl-to-sql.ts` — the actual Vercel serverless function; a thin adapter (CORS headers,
  request/response translation) over `nlToSqlHandler.ts`. All real logic lives in `src/`.

## Environment variables (set these in Vercel → Settings → Environment Variables)

- **`GEMINI_API_KEY`** (required) — your free API key from
  [Google AI Studio](https://aistudio.google.com/app/apikey). Without this, every request returns
  a 500 error on purpose, rather than silently failing in a confusing way.
- **`APP_SHARED_SECRET`** (optional) — a value your frontend sends as the `x-app-key` header. This
  is a **casual speed bump against automated abuse of a public endpoint URL, not real security** —
  since your frontend is a static site, whatever value it sends is visible to anyone who inspects
  its network requests. Leave it unset to skip this check entirely; set it if you want a minor
  deterrent against random bots hitting the endpoint.

## Running the tests locally

```bash
npm install
npm run typecheck
npm test
```

16 tests, all pure/unit (no real API calls — Gemini's response is simulated), covering: normal
question → SQL generation, the model declining with its own error message, request validation,
Gemini API failures, and — the most important one — a simulated malicious/misbehaving model
response being caught and never forwarded.

## Deploying

1. Push this repo to GitHub.
2. Import it into Vercel (same flow as any other project — "Add New Project" → pick the repo).
3. Set the two environment variables above in Vercel's project settings.
4. Deploy. Your endpoint will be live at `https://<your-project>.vercel.app/api/nl-to-sql`.

## Calling it from your DeepSite site

See `DEEPSITE_PROMPT.md` for the exact follow-up prompt to give DeepSite once this is deployed —
it wires up the "ask in plain English" box on your existing QueryPilot site to call this endpoint
and run the returned SQL locally.

## What this deliberately does NOT do

- No database, no accounts, no storage of any question or query anywhere. Each request is
  handled and forgotten.
- No execution of SQL on this backend at all — it only *generates* the query text. Execution
  happens entirely client-side against the user's own loaded data.
- No real rate limiting yet. If you make this endpoint's URL public, anyone who finds it could
  send it requests and consume your Gemini API free-tier quota. Fine for a demo/personal project;
  worth adding a proper rate limiter (e.g. Upstash Redis, keyed on IP) before wider use.

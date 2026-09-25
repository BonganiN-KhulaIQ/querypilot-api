import { SYSTEM_PROMPT, buildUserPrompt } from "./promptBuilder.js";
import type { TableSchema } from "./types.js";

// gemini-2.5-flash: a stable, well-documented model with a genuine free
// tier via Google AI Studio (console.aistudio.google.com or
// generativelanguage.googleapis.com directly). If a newer/cheaper
// free-tier model is available by the time you read this, you can swap
// this constant — nothing else here needs to change.
const MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const RESPOND_WITH_SQL_FUNCTION = {
  name: "respond_with_sql",
  description:
    "Return the generated SQL query, or a short error message if the question can't be safely answered with a single SELECT statement against the given schema.",
  parameters: {
    type: "object" as const,
    properties: {
      sql: {
        type: "string" as const,
        description: "A single SQLite SELECT statement answering the question. Omit if returning error instead.",
      },
      error: {
        type: "string" as const,
        description: "A short, user-facing explanation. Omit if returning sql instead.",
      },
    },
  },
};

/** What the model itself returned, before this backend's own safety gate runs on it. */
export interface ModelToolOutput {
  sql?: string;
  error?: string;
}

export class GeminiClientError extends Error {}

/**
 * Calls Gemini with a forced function call (toolConfig mode "ANY",
 * restricted to respond_with_sql), so the response is always structured
 * data rather than free text that would need fragile parsing.
 * `fetchImpl` is injectable for testing — production code omits it and
 * gets the real global fetch.
 */
export async function callGeminiForSql(
  apiKey: string,
  schema: TableSchema,
  question: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelToolOutput> {
  const response = await fetchImpl(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(schema, question) }] }],
      tools: [{ functionDeclarations: [RESPOND_WITH_SQL_FUNCTION] }],
      toolConfig: {
        functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["respond_with_sql"] },
      },
      generationConfig: { temperature: 0 },
    }),
  });

  if (!response.ok) {
    // Include Gemini's own error body (truncated) so the real cause — bad
    // API key, wrong model name, quota exhausted, etc. — is visible in
    // server-side logs. Never sent to the client: only this Error's
    // message is logged server-side; handleNlToSqlRequest always returns
    // a generic, safe message to the caller.
    const bodyText = await response.text().catch(() => "");
    throw new GeminiClientError(
      `Gemini API request failed with status ${response.status}: ${bodyText.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ functionCall?: { name?: string; args?: unknown } }> } }>;
  };

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const functionCallPart = parts.find(
    (part) => part.functionCall?.name === "respond_with_sql",
  );

  if (!functionCallPart?.functionCall || typeof functionCallPart.functionCall.args !== "object" || functionCallPart.functionCall.args === null) {
    throw new GeminiClientError("Gemini did not return the expected function call");
  }

  const args = functionCallPart.functionCall.args as Record<string, unknown>;
  const result: ModelToolOutput = {};
  if (typeof args["sql"] === "string") result.sql = args["sql"];
  if (typeof args["error"] === "string") result.error = args["error"];
  return result;
}

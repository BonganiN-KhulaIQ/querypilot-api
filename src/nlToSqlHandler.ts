import { NlToSqlRequestSchema, type NlToSqlResult } from "./types.js";
import { callGeminiForSql, GeminiClientError } from "./geminiClient.js";
import { validateSelectOnlySql } from "./sqlSafety.js";

export class BadRequestError extends Error {}

/**
 * Handles one natural-language-to-SQL request end to end: validates the
 * request shape, asks Gemini for a candidate SELECT statement, then runs
 * that candidate through the deterministic safety gate (sqlSafety.ts)
 * before ever returning it. The model's own output is never trusted on
 * its own — this function's whole job is not skipping that check.
 */
export async function handleNlToSqlRequest(
  rawBody: unknown,
  apiKey: string,
  fetchImpl?: typeof fetch,
): Promise<NlToSqlResult> {
  const parsed = NlToSqlRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new BadRequestError("Request body must be { question: string, schema: {...} }");
  }
  const { question, schema } = parsed.data;

  let modelOutput;
  try {
    modelOutput = await callGeminiForSql(apiKey, schema, question, fetchImpl);
  } catch (err) {
    if (err instanceof GeminiClientError) {
      return { ok: false, error: "Couldn't generate a query right now. Please try again." };
    }
    throw err;
  }

  if (modelOutput.error && !modelOutput.sql) {
    return { ok: false, error: modelOutput.error };
  }

  if (!modelOutput.sql) {
    return { ok: false, error: "No query was generated for that question." };
  }

  const safety = validateSelectOnlySql(modelOutput.sql);
  if (!safety.ok) {
    // The model's raw candidate is deliberately never surfaced here, even
    // in an error message — only a generic, safe explanation is returned.
    return {
      ok: false,
      error: "The generated query didn't pass a safety check, so it wasn't run. Try rephrasing your question.",
    };
  }

  return { ok: true, sql: safety.sql };
}

/**
 * Deterministic post-generation safety gate for AI-generated SQL.
 *
 * This is the QueryPilot equivalent of CalmPath's output gate: the LLM's
 * output is NEVER trusted as-is, no matter how the request/prompt was
 * built or how the model was instructed. Every candidate query — even one
 * the model produced while following its system prompt correctly — passes
 * through this check before it is ever returned to the browser. A crafted
 * or unusual "question" from the user (prompt injection, an attempt to
 * trick the model into writing a destructive statement) is exactly the
 * scenario this exists for.
 *
 * Deliberately conservative: rejects anything that isn't unambiguously a
 * single, read-only SELECT statement, rather than trying to allow a wider
 * set of "probably fine" constructs.
 */

export type SqlSafetyResult =
  | { ok: true; sql: string }
  | { ok: false; reason: string };

const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|replace|truncate|grant|revoke|exec|execute)\b/i;

export function validateSelectOnlySql(rawSql: string): SqlSafetyResult {
  const sql = rawSql.trim();

  if (sql.length === 0) {
    return { ok: false, reason: "empty_query" };
  }

  if (!/^select\b/i.test(sql)) {
    return { ok: false, reason: "not_a_select_statement" };
  }

  if (FORBIDDEN_KEYWORDS.test(sql)) {
    return { ok: false, reason: "forbidden_keyword" };
  }

  // Comments could otherwise be used to smuggle a second statement past a
  // naive "only one semicolon" check, or to hide intent from a human
  // reviewing the query before running it.
  if (/--|\/\*/.test(sql)) {
    return { ok: false, reason: "sql_comment_not_allowed" };
  }

  // Exactly one statement: a single optional trailing semicolon is fine,
  // but any semicolon before the end means a second statement follows.
  const withoutTrailingSemicolon = sql.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    return { ok: false, reason: "multiple_statements_not_allowed" };
  }

  return { ok: true, sql: withoutTrailingSemicolon };
}

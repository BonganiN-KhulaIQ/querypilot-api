import type { TableSchema } from "./types.js";

export const SYSTEM_PROMPT = `You translate a business user's plain-English question into a single SQLite SELECT statement, given a table's structure.

Rules:
- Output exactly one SQLite SELECT statement, and nothing else — no INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, ATTACH, PRAGMA, or any statement that modifies data or schema.
- Only reference the table and columns given to you. Never invent a column or table name.
- Never include comments (--, /* */) or more than one statement.
- If the question cannot be answered with a single safe SELECT statement against the given schema (e.g. it asks to change data, or needs a column/table that doesn't exist, or isn't really a data question at all), do not write SQL — explain briefly why in the error field instead.
- Always respond using the respond_with_sql tool, never as plain text.`;

export function buildUserPrompt(schema: TableSchema, question: string): string {
  const columnsDescription = schema.columns.map((c) => `${c.name} (${c.type})`).join(", ");
  return [
    `Table: ${schema.table}`,
    `Columns: ${columnsDescription}`,
    "",
    `Question: ${question}`,
  ].join("\n");
}

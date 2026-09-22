import { z } from "zod";

/**
 * The client sends only the table's structure — column names and types —
 * never actual data rows. This is a deliberate privacy choice: the LLM
 * (and this backend) only ever sees the shape of the user's data and the
 * English question, never the data itself. Query execution happens
 * entirely in the browser (via sql.js) against the user's real rows.
 */
export const TableSchemaSchema = z.object({
  table: z.string().min(1).max(128),
  columns: z
    .array(
      z.object({
        name: z.string().min(1).max(128),
        type: z.string().min(1).max(64),
      }),
    )
    .min(1)
    .max(100),
});

export type TableSchema = z.infer<typeof TableSchemaSchema>;

export const NlToSqlRequestSchema = z.object({
  question: z.string().min(1).max(1000),
  schema: TableSchemaSchema,
});

export type NlToSqlRequest = z.infer<typeof NlToSqlRequestSchema>;

export interface NlToSqlSuccess {
  ok: true;
  sql: string;
}

export interface NlToSqlFailure {
  ok: false;
  error: string;
}

export type NlToSqlResult = NlToSqlSuccess | NlToSqlFailure;

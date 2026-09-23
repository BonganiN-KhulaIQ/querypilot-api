import { describe, expect, it } from "vitest";
import { validateSelectOnlySql } from "../src/sqlSafety.js";

describe("validateSelectOnlySql", () => {
  it("allows a plain SELECT statement", () => {
    const result = validateSelectOnlySql("SELECT * FROM orders WHERE amount > 100");
    expect(result.ok).toBe(true);
  });

  it("allows a SELECT with a single trailing semicolon, stripping it", () => {
    const result = validateSelectOnlySql("SELECT name FROM customers;");
    expect(result).toEqual({ ok: true, sql: "SELECT name FROM customers" });
  });

  it("allows case-insensitive select and aggregate functions", () => {
    const result = validateSelectOnlySql("select customer_name, sum(amount) from orders group by customer_name");
    expect(result.ok).toBe(true);
  });

  it("rejects an empty query", () => {
    expect(validateSelectOnlySql("")).toEqual({ ok: false, reason: "empty_query" });
    expect(validateSelectOnlySql("   ")).toEqual({ ok: false, reason: "empty_query" });
  });

  it("rejects anything that isn't a SELECT statement", () => {
    expect(validateSelectOnlySql("INSERT INTO orders VALUES (1, 2, 3)").ok).toBe(false);
    expect(validateSelectOnlySql("UPDATE orders SET amount = 0").ok).toBe(false);
    expect(validateSelectOnlySql("DELETE FROM orders").ok).toBe(false);
    expect(validateSelectOnlySql("DROP TABLE orders").ok).toBe(false);
  });

  it("rejects a SELECT that smuggles a destructive statement via a semicolon", () => {
    // Caught by the forbidden-keyword check before it even reaches the
    // multi-statement check — either reason is an acceptable rejection;
    // what matters is that it's rejected at all.
    const result = validateSelectOnlySql("SELECT * FROM orders; DROP TABLE orders;");
    expect(result.ok).toBe(false);
  });

  it("rejects multiple SELECT-only statements chained together (no forbidden keyword to catch it first)", () => {
    const result = validateSelectOnlySql("SELECT * FROM orders; SELECT * FROM customers;");
    expect(result).toEqual({ ok: false, reason: "multiple_statements_not_allowed" });
  });

  it("rejects a forbidden keyword even when it appears after a SELECT starts correctly", () => {
    // A model tricked (or manipulated via prompt injection in the question)
    // into trying something like this must still be caught here.
    const result = validateSelectOnlySql("SELECT * FROM orders; ATTACH DATABASE '/etc/passwd' AS x;");
    expect(result.ok).toBe(false);
  });

  it("rejects SQL comments, which could hide a smuggled statement or intent", () => {
    expect(validateSelectOnlySql("SELECT * FROM orders -- ; DROP TABLE orders").ok).toBe(false);
    expect(validateSelectOnlySql("SELECT * FROM orders /* comment */").ok).toBe(false);
  });

  it("rejects a bare forbidden-keyword statement disguised with leading whitespace/newlines", () => {
    expect(validateSelectOnlySql("\n\n   DROP TABLE orders").ok).toBe(false);
  });
});

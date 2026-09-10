import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Routers may read the database directly but never write to it: every insert, update
// or delete goes through audited(context).write so the Audit Event shares the transaction.
// Deletes are forbidden outright — farm records are never removed.
const ROUTERS = path.join(import.meta.dirname, "routers");
const DIRECT_WRITE = /context\.db\s*\.\s*(?:insert|update|delete)\s*\(/u;
const DB_DELETE = /\b(?:tx|db)\s*\.\s*delete\s*\(/u;

const sources = readdirSync(ROUTERS)
  .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
  .map(
    (name) => [name, readFileSync(path.join(ROUTERS, name), "utf-8")] as const
  );

describe("write discipline", () => {
  it("no router writes to the database outside the audited helper", () => {
    expect(
      sources
        .filter(([, source]) => DIRECT_WRITE.test(source))
        .map(([name]) => name)
    ).toEqual([]);
  });

  it("no router deletes anything", () => {
    expect(
      sources
        .filter(([, source]) => DB_DELETE.test(source))
        .map(([name]) => name)
    ).toEqual([]);
  });
});

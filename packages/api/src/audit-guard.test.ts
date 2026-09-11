import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Routers may read the database directly but never write to it: every insert, update or
// delete goes through the audited helper so the Audit Event shares the transaction. That
// holds for a transaction the router opened itself, too — a batch writes on its own `tx`
// (ADR 0002), and a `tx.insert` in a router would be exactly the shape the rule exists to
// prevent, so the check covers both handles.
// Deletes are forbidden outright — farm records are never removed.
const ROUTERS = path.join(import.meta.dirname, "routers");
const DIRECT_WRITE = /context\.db\s*\.\s*(?:insert|update|delete)\s*\(/u;
/** A router that opens its own transaction is a router that can write without a trail: the
 *  writes inside it answer to nothing. Transactions belong to the audited helper and to the
 *  stores, where the Audit Event is written beside the change. */
const RAW_TRANSACTION = /context\.db\s*\.\s*transaction\s*\(/u;
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

  it("no router opens its own transaction", () => {
    expect(
      sources
        .filter(([, source]) => RAW_TRANSACTION.test(source))
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

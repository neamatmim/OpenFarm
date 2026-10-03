import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { translate } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { describe, expect, it } from "vitest";

import { ENTITIES } from "./audit-words";

// The audit trail names each kind of record in the reader's words — falling back to the farm's own name for it, in
// English, where it has none. Every kind the server writes into the trail has its words, so a Bangla screen never
// reads "investment_agreement".

const API = path.join(import.meta.dirname, "../../../../../packages/api/src");

const sourcesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const at = path.join(dir, name);
    if (statSync(at).isDirectory()) {
      return name === "seed" || name === "test" ? [] : sourcesUnder(at);
    }
    return at.endsWith(".ts") && !at.includes(".test.") ? [at] : [];
  });

const ENTITY = /entity:\s*"(?<name>[a-z_]+)"/gu;

/** Every kind of record the server names in an Audit Event it writes. */
const written = [
  ...new Set(
    sourcesUnder(API).flatMap((file) =>
      [...readFileSync(file, "utf-8").matchAll(ENTITY)].map(
        (match) => match.groups?.name ?? ""
      )
    )
  ),
].toSorted();

const said = (key: string) =>
  (["en", "bn"] as const).every((language) => {
    try {
      return translate(language, key as MessageKey) !== key;
    } catch {
      return false;
    }
  });

describe("the kinds of record the trail names", () => {
  it("finds the kinds the server writes", () => {
    expect(written.length).toBeGreaterThan(50);
  });

  it("names every kind the server writes into the trail", () => {
    expect(
      written.filter((one) => !(ENTITIES as readonly string[]).includes(one))
    ).toEqual([]);
  });

  it("has words in both languages for every kind it names", () => {
    expect(ENTITIES.filter((one) => !said(`audit.entity.${one}`))).toEqual([]);
  });
});

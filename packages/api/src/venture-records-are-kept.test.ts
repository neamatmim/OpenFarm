import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A Venture's records are kept, and this is where that stops being an accident.
 *
 * Stories 73 and 99 want a Venture's settlement record, its payments and its statements kept for at
 * least twelve years and never deleted. Twelve is the longest period that applies — a company's books
 * under the Companies Act 1994 s.181(5) — and it covers VAT's five years and the six assessment years
 * income tax can reach back through. An Investor who disputes a payout years later has to meet the
 * evidence rather than a gap.
 *
 * Nothing purges anything today, so they all survive. That is true by omission, and omissions do not
 * survive a year of changes. This names every deletion the farm makes of a Venture record, so that a new
 * one cannot be added without somebody saying so here first.
 *
 * Named, not counted, for the same reason `unworded-refusals.test.ts` names its own list: a number going
 * up tells nobody which one arrived.
 */

/** The tables that hold a Venture's whole story, as `packages/db/src/schema/venture.ts` declares them — and the
 *  wording its Agreements and Amendments were signed in, from `paper-template.ts`, without which a paper kept for
 *  twelve years could not be printed again as it was signed. */
const A_VENTURES_OWN = [
  "venture",
  "investor",
  "investmentAgreement",
  "agreementAmendment",
  "amendmentPaper",
  "agreementPaper",
  "ventureMovement",
  "ventureBankCheck",
  "ventureSettlement",
  "ventureSettlementShare",
  "settlementAdjustment",
  "paperTemplate",
  "paperTemplateVersion",
];

/**
 * The deletions of a Venture record the farm makes, as they stood on 2026-09-20.
 *
 * `ventureMovement` — a Sale writes a payment into the Venture's account; a Correction saying the Animal
 * was the Farm's, or that she was given away for nothing, takes it out again rather than reversing it,
 * because the farm is no longer claiming a payment it does not hold. The Audit Event for that Correction
 * keeps who, when, why and the figures either side. Whether that is enough for the twelve years, or
 * whether the payment must be reversed and left standing, is asked of the lawyer in the brief that went
 * to him; until he answers it stays as it is, pinned here.
 */
const DELETED = ["ventureMovement"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return name.endsWith(".ts") ? [full] : [];
  });

const DELETES = /\.delete\(\s*(?<table>[A-Za-z][A-Za-z0-9_]*)\s*\)/gu;

const ventureRecordsDeleted = (): string[] => {
  const found = new Set<string>();
  for (const file of walk("src")) {
    if (
      file.includes(".test.") ||
      file.includes(`${path.sep}seed${path.sep}`)
    ) {
      continue;
    }
    for (const hit of readFileSync(file, "utf-8").matchAll(DELETES)) {
      const table = hit.groups?.table;
      if (table && A_VENTURES_OWN.includes(table)) {
        found.add(table);
      }
    }
  }
  return [...found].toSorted();
};

describe("a Venture's records", () => {
  it("are deleted only where somebody has said they may be", () => {
    expect(ventureRecordsDeleted()).toEqual(DELETED);
  });

  it("finds the deletions it is checking against at all", () => {
    // If the pattern or the paths quietly stopped matching, the guard above would pass by knowing
    // nothing — so prove it can still see a deletion that is really there.
    const anyAtAll = walk("src")
      .filter((file) => !file.includes(".test."))
      .flatMap((file) => [...readFileSync(file, "utf-8").matchAll(DELETES)]);
    expect(anyAtAll.length).toBeGreaterThan(
      A_VENTURES_OWN.length === 0 ? 0 : 3
    );
  });
});

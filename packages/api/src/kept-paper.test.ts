import type { PaperDocument } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { assertReadAsKept, keepPaper, stillAsKept } from "./kept-paper";

// A paper an Investor agrees to in the app is kept exactly as it was laid out, and an agreement is held to that paper
// and no other — however the database hands it back.

const A_PAPER: PaperDocument = {
  letterhead: { name: "খামার", details: ["সাভার, ঢাকা"] },
  title: { bn: "মুদারাবা বিনিয়োগ চুক্তি", en: "Mudaraba Investment Agreement" },
  preamble: { bn: "এই চুক্তি", en: "This Agreement" },
  sections: [
    {
      kind: "clauses",
      heading: { bn: "শর্ত", en: "Terms" },
      clauses: [{ bn: "বিনিয়োগকারী ৬০%", en: "60% to the Investor" }],
    },
  ],
  closing: ["কোনো মুনাফার নিশ্চয়তা নেই"],
  produced: "৩ অক্টোবর ২০২৬",
};

/** The same paper with every object's keys the other way round, as a jsonb column may hand it back. */
const reordered = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(reordered);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toReversed()
        .map(([key, inner]) => [key, reordered(inner)])
    );
  }
  return value;
};

const refusalOf = (act: () => void) => {
  try {
    act();
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal;
  }
  return null;
};

describe("a kept paper", () => {
  it("is kept as laid out, and is still as kept read back in another order", () => {
    const kept = keepPaper(A_PAPER);
    expect(kept.paper).toEqual(A_PAPER);
    expect(stillAsKept({ ...kept, paper: reordered(kept.paper) })).toBe(true);
  });

  it("is not still as kept once a word of it has changed", () => {
    const kept = keepPaper(A_PAPER);
    const changed = structuredClone(A_PAPER);
    changed.preamble.bn = "অন্য চুক্তি";
    expect(stillAsKept({ ...kept, paper: changed })).toBe(false);
  });

  it("takes an agreement to the paper kept, and refuses one to any other", () => {
    const kept = keepPaper(A_PAPER);
    const other = keepPaper({ ...A_PAPER, produced: "৪ অক্টোবর ২০২৬" });
    expect(refusalOf(() => assertReadAsKept(kept, kept.paperHash))).toBeNull();
    expect(refusalOf(() => assertReadAsKept(kept, other.paperHash))).toBe(
      "paper_changed_since"
    );
  });
});

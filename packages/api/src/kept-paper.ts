import { createHash } from "node:crypto";

import type { PaperDocument } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

// A paper an Investor agrees to in the app — an Agreement or an Amendment offered — kept exactly as it was laid out,
// with the fingerprint an agreement to it is held to. Whatever wording the farm publishes afterwards, what was agreed
// is this paper and no other.

/** A paper kept as laid out, and its fingerprint: stored together, and an agreement is recorded against the
 *  fingerprint. */
export interface KeptPaper {
  paper: PaperDocument;
  paperHash: string;
}

/** Two keys in the order of their characters: the same on every server, whatever its language settings, as a
 *  fingerprint kept for good has to be. */
const byCharacter = ([one]: [string, unknown], [other]: [string, unknown]) => {
  if (one === other) {
    return 0;
  }
  return one < other ? -1 : 1;
};

/** A value with every object's keys in order: the same paper, kept as jsonb and read back, writes out the same. */
const inKeyOrder = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(inKeyOrder);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(byCharacter)
        .map(([key, inner]) => [key, inKeyOrder(inner)])
    );
  }
  return value;
};

/** The fingerprint of a paper: taken over it with its keys in order, as the database keeps it in an order of its own. */
const fingerprintOf = (paper: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(inKeyOrder(paper)))
    .digest("hex");

/** Keeps a paper as it was laid out, with its fingerprint. */
export const keepPaper = (paper: PaperDocument): KeptPaper => ({
  paper,
  paperHash: fingerprintOf(paper),
});

/** Whether a paper read back from where it was kept is still the paper kept, to the letter. */
export const stillAsKept = (kept: { paper: unknown; paperHash: string }) =>
  fingerprintOf(kept.paper) === kept.paperHash;

/** Refuses an agreement to a paper other than the one kept: the fingerprint of what they read must be the kept one's. */
export const assertReadAsKept = (
  kept: { paperHash: string },
  readHash: string
): void => {
  if (kept.paperHash !== readHash) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The paper read is not the paper offered; read it again",
      data: { refusal: "paper_changed_since" },
    });
  }
};

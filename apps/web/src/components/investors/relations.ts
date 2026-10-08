import type { Relation } from "@OpenFarm/domain";
import { RELATION_WORDS, relationOf } from "@OpenFarm/domain";

export type { Relation } from "@OpenFarm/domain";

/** The people an Investor names as a Nominee almost every time, in the order a family is usually spoken of — and a
 *  minor Nominee's Receiver is almost always one of the same, to the Nominee. */
export const RELATIONS = Object.keys(RELATION_WORDS) as Relation[];

/** Nothing chosen, one of the usual relations, or somebody else whose relation is written in words. */
export type RelationChoice = "" | Relation | "other";

export const isRelation = (value: string): value is Relation =>
  (RELATIONS as readonly string[]).includes(value);

/**
 * The relation as it is kept: a word, in Bangla whatever language the form was filled in — from the domain's words, not
 * the catalog, which holds only the reader's language. Nothing, for nothing chosen.
 */
export const relationWord = (
  choice: RelationChoice,
  inWords: string
): string | null => {
  if (choice === "other") {
    return inWords.trim() === "" ? null : inWords;
  }
  return choice === "" ? null : RELATION_WORDS[choice].bn;
};

/** A relation as it was kept, back as a form offers it: one of the usual ones where the word is theirs, or somebody
 *  else, in the words that were written. */
export const relationChoiceOf = (
  word: string | null | undefined
): { choice: RelationChoice; inWords: string } => {
  const kept = word?.trim() ?? "";
  if (kept === "") {
    return { choice: "", inWords: "" };
  }
  // Its Bangla word, or the English a form in English once kept.
  const usual = relationOf(kept);
  return usual
    ? { choice: usual, inWords: "" }
    : { choice: "other", inWords: kept };
};

import { translate } from "@OpenFarm/i18n";

/** The people an Investor names as a Nominee almost every time, in the order a family is usually spoken of — and a
 *  minor Nominee's Receiver is almost always one of the same, to the Nominee. */
export const RELATIONS = [
  "wife",
  "husband",
  "son",
  "daughter",
  "father",
  "mother",
  "brother",
  "sister",
] as const;

export type Relation = (typeof RELATIONS)[number];

/** Nothing chosen, one of the usual relations, or somebody else whose relation is written in words. */
export type RelationChoice = "" | Relation | "other";

export const isRelation = (value: string): value is Relation =>
  (RELATIONS as readonly string[]).includes(value);

/**
 * The relation as it is kept: a word, in Bangla whatever language the form was filled in, because the papers print it
 * as it stands and the relations already on file are Bangla words. Nothing, for nothing chosen.
 */
export const relationWord = (
  choice: RelationChoice,
  inWords: string
): string | null => {
  if (choice === "other") {
    return inWords.trim() === "" ? null : inWords;
  }
  return choice === "" ? null : translate("bn", `investors.relation.${choice}`);
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
  const usual = RELATIONS.find(
    (relation) => translate("bn", `investors.relation.${relation}`) === kept
  );
  return usual
    ? { choice: usual, inWords: "" }
    : { choice: "other", inWords: kept };
};

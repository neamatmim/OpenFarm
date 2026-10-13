import { isTagNumber, tagNumberAsWritten } from "@OpenFarm/domain";

/**
 * What somebody typed to find an animal, read as the farm writes its tags (`tagNumberAsWritten`): ডি-১২ and D12 are
 * D-0012, and a bare ১২ is 12. A milker whose phone types ১২ is looking for D-0012, not for nothing.
 */
export const tagSought = (typed: string): string => tagNumberAsWritten(typed);

/** Whether a Tag Number holds what was sought — as `tagSought` reads it — anywhere in it. */
export const tagMatches = (tagNumber: string, sought: string): boolean =>
  tagNumber.toUpperCase().includes(sought);

/** The number a Tag Number ends in, without its prefix or its padding: D-0012 is 12. */
const numberOf = (tagNumber: string): number | null => {
  const digits = /(?<digits>\d+)$/u.exec(tagNumber)?.groups?.digits;
  return digits === undefined ? null : Number(digits);
};

/**
 * The one animal a search names outright, or nothing: a whole tag, however it was typed, names hers; a bare number —
 * "12" for D-0012 — names the one animal numbered so, and none where both Sides have it. Anything else is for the list
 * to narrow, not for this to guess.
 */
export const tagNumbered = (
  tagNumbers: readonly string[],
  sought: string
): string | null => {
  if (isTagNumber(sought)) {
    return tagNumbers.includes(sought) ? sought : null;
  }
  if (!/^\d+$/u.test(sought)) {
    return null;
  }
  const number = Number(sought);
  const numbered = tagNumbers.filter((tag) => numberOf(tag) === number);
  return numbered.length === 1 ? (numbered[0] ?? null) : null;
};

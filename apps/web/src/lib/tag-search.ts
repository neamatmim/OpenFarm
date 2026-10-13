import { latinDigitsOf } from "@OpenFarm/i18n";

/** The Bangla a Tag Number's prefix is spoken and typed as, beside the letter it is written with. */
const BANGLA_PREFIX: readonly (readonly [string, string])[] = [
  ["ডি", "D"],
  ["এফ", "F"],
];

/**
 * What somebody typed to find an animal, as Tag Numbers are written: capitals, English digits, and the D or F a
 * Bangla keyboard types as ডি or এফ. A milker whose phone types ১২ is looking for D-0012, not for nothing.
 */
export const tagSought = (typed: string): string => {
  let sought = latinDigitsOf(typed.trim());
  for (const [bangla, letter] of BANGLA_PREFIX) {
    if (sought.startsWith(bangla)) {
      sought = letter + sought.slice(bangla.length);
    }
  }
  return sought.toUpperCase();
};

/** Whether a Tag Number holds what was sought — as `tagSought` reads it — anywhere in it. */
export const tagMatches = (tagNumber: string, sought: string): boolean =>
  tagNumber.toUpperCase().includes(sought);

/** The number a Tag Number ends in, without its prefix or its padding: D-0012 is 12. */
const numberOf = (tagNumber: string): number | null => {
  const digits = /(?<digits>\d+)$/u.exec(tagNumber)?.groups?.digits;
  return digits === undefined ? null : Number(digits);
};

/**
 * The one animal whose number is the one typed bare — "12" for D-0012 — or nothing: a number both Sides have, or
 * anything typed with its prefix, is for the list to narrow, not for this to guess.
 */
export const tagNumbered = (
  tagNumbers: readonly string[],
  sought: string
): string | null => {
  if (!/^\d+$/u.test(sought)) {
    return null;
  }
  const number = Number(sought);
  const numbered = tagNumbers.filter((tag) => numberOf(tag) === number);
  return numbered.length === 1 ? (numbered[0] ?? null) : null;
};

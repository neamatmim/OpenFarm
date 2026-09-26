import { numberAsTyped } from "@OpenFarm/i18n";

/** A typed figure as a number, Bangla digits and all; nothing for a blank. */
export const figureOf = (typed: string): number | null => {
  const plain = numberAsTyped(typed);
  return plain === "" ? null : Number(plain);
};

/** A figure the Owner may use: a real number above nothing — or, where nothing is a figure too (a gain), not below
 *  it. */
export const aFigure = (
  value: number | null,
  orNothing = false
): value is number =>
  value !== null &&
  Number.isFinite(value) &&
  (orNothing ? value >= 0 : value > 0);

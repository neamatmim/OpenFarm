import { latinDigitsOf } from "@OpenFarm/i18n";

import { timeOf } from "./course-times";

const WHOLE = /^\d+$/u;

/** What is wrong with a figure typed into one of the farm's settings, or nothing: not a whole number, or outside the
 *  range the farm takes. Said under the box in the reader's words, before saving — the browser said it in its own
 *  language, English on most desks, and only once Save was pressed. */
export const parameterProblem = (
  typed: string,
  range: { min?: number; max?: number }
): "notAWholeFigure" | "outOfRange" | null => {
  const latin = latinDigitsOf(typed.trim());
  if (!WHOLE.test(latin)) {
    return "notAWholeFigure";
  }
  const figure = Number(latin);
  const tooLow = range.min !== undefined && figure < range.min;
  const tooHigh = range.max !== undefined && figure > range.max;
  return tooLow || tooHigh ? "outOfRange" : null;
};

/** A setting's figure as the farm keeps it, Bangla digits read as digits. */
export const parameterFigure = (typed: string): number =>
  Number(latinDigitsOf(typed.trim()));

/** The digest's times as typed — "০৭:০০, 18:00", "7:00" — as the farm keeps them; a part that is no time is kept as
 *  typed, for the farm to name. */
export const digestTimesOf = (typed: string): string[] =>
  typed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => timeOf(part) ?? part);

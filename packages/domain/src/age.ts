import { farmDayOf } from "./farm-clock";

const MONTHS_IN_A_YEAR = 12;

/** What an Intake says about how old she was: the seller's word, and the day it was given. */
export interface AgeAtIntake {
  estimatedAgeMonths: number;
  arrivedAt: Date | string;
}

/** How old an Animal is in whole months, and whether that is known or only estimated. */
export interface Age {
  months: number;
  estimated: boolean;
}

/** The farm day an instant falls on, as its year, month and day of the month. */
const calendarOf = (at: Date) => {
  const [year = 0, month = 0, day = 0] = farmDayOf(at).split("-").map(Number);
  return { year, month, day };
};

/** Whole months from one farm day to a later one: a month is not counted until its day of the month comes round. */
const wholeMonthsBetween = (from: Date, to: Date): number => {
  const start = calendarOf(from);
  const end = calendarOf(to);
  const months =
    (end.year - start.year) * MONTHS_IN_A_YEAR +
    (end.month - start.month) -
    (end.day < start.day ? 1 : 0);
  return Math.max(0, months);
};

/**
 * How old she is today, as the farm can say it.
 *
 * Counted from her birth where the farm wrote it down. A bought-in animal usually arrives without
 * one: the seller says roughly how old she is and her Intake keeps it, so her age is that word
 * plus the months she has been here since — an estimate, and marked as one. Neither makes up a
 * birth date. Null for an animal nobody has said anything about.
 */
export const ageOf = (
  her: { birthDate: Date | string | null; ageAtIntake: AgeAtIntake | null },
  now: Date
): Age | null => {
  if (her.birthDate !== null) {
    return {
      months: wholeMonthsBetween(new Date(her.birthDate), now),
      estimated: false,
    };
  }
  if (her.ageAtIntake !== null) {
    return {
      months:
        her.ageAtIntake.estimatedAgeMonths +
        wholeMonthsBetween(new Date(her.ageAtIntake.arrivedAt), now),
      estimated: true,
    };
  }
  return null;
};

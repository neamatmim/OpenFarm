import { monthAt, monthIndexOf } from "./costs";

// The farm's Financial Year (ADR 0016, 0017): twelve months from the month its server says years begin in — July for a
// farm in Bangladesh — until the Owner records a Year Change. A change names the year that changes, by the month it
// begins, and the month the first year of the new rule begins: the year between is the Transition Year, shorter or
// longer than twelve months (Bangladesh's 2027–28 runs July to March, nine months). Years are worked out on read from
// the rules, never stored, and no change may move a year that has ended.

/** A recorded change of the farm's year: the year that changes, and the month the first year of the new rule begins
 *  — the changing year, the Transition Year, ends the month before. Both "YYYY-MM". */
export interface YearChange {
  changingFrom: string;
  newFrom: string;
}

/** How the farm's years run: the month they began in before any change, the server's setting, and the changes in
 *  force, oldest first. */
export interface YearRules {
  firstStarts: number;
  changes: readonly YearChange[];
}

/** One of the farm's financial years: its first and last months ("YYYY-MM"), first and last farm days, and how many
 *  months it has — twelve, or another count for a Transition Year. */
export interface FinancialYear {
  start: string;
  last: string;
  from: string;
  to: string;
  months: number;
}

/** The longest a Transition Year may run: under two years, as company law's eighteen months and Sweden's 1995/96 are. */
const LONGEST_TRANSITION = 23;
const MONTHS_A_YEAR = 12;

/** Whether a figure is a month a year can begin in: a whole number from 1 to 12. */
export const isYearStart = (month: number): boolean =>
  Number.isInteger(month) && month >= 1 && month <= MONTHS_A_YEAR;

/** The last day of a "YYYY-MM" month, as a farm day. */
const lastDayOf = (month: string): string => {
  const days = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
  ).getUTCDate();
  return `${month}-${String(days).padStart(2, "0")}`;
};

/** The year that runs from one counted month up to, not including, another. */
const yearBetween = (start: number, until: number): FinancialYear => {
  const first = monthAt(start);
  const last = monthAt(until - 1);
  return {
    start: first,
    last,
    from: `${first}-01`,
    to: lastDayOf(last),
    months: until - start,
  };
};

/** The latest month at or before a counted month that is the given month of the year (1 to 12). */
const startAtOrBefore = (index: number, month: number): number =>
  index -
  ((((index - (month - 1)) % MONTHS_A_YEAR) + MONTHS_A_YEAR) % MONTHS_A_YEAR);

/** The month of the year a "YYYY-MM" month is, 1 to 12. */
const monthOfYear = (month: string): number => Number(month.slice(5, 7));

/** The year a counted month falls in, under the rules: before a change, a year of the rule then; inside it, the
 *  Transition Year; after the last, a year of the newest rule. */
const yearAt = (rules: YearRules, index: number): FinancialYear => {
  let starts = rules.firstStarts;
  for (const change of rules.changes) {
    const changing = monthIndexOf(change.changingFrom);
    const next = monthIndexOf(change.newFrom);
    if (index < changing) {
      const start = startAtOrBefore(index, starts);
      return yearBetween(start, start + MONTHS_A_YEAR);
    }
    if (index < next) {
      return yearBetween(changing, next);
    }
    starts = monthOfYear(change.newFrom);
  }
  const start = startAtOrBefore(index, starts);
  return yearBetween(start, start + MONTHS_A_YEAR);
};

/** The financial year a farm day or a "YYYY-MM" month falls in. */
export const financialYearOf = (
  rules: YearRules,
  monthOrDay: string
): FinancialYear => yearAt(rules, monthIndexOf(monthOrDay));

/** The financial year that begins in a "YYYY-MM" month, or nothing where no year begins in it. */
export const financialYearStarting = (
  rules: YearRules,
  start: string
): FinancialYear | null => {
  const year = financialYearOf(rules, start);
  return year.start === start ? year : null;
};

/** The year before one, and the year after it. */
export const yearBefore = (
  rules: YearRules,
  year: FinancialYear
): FinancialYear => yearAt(rules, monthIndexOf(year.start) - 1);

export const yearAfter = (
  rules: YearRules,
  year: FinancialYear
): FinancialYear => yearAt(rules, monthIndexOf(year.last) + 1);

/** The financial years from the one a farm day falls in back to the one another falls in, newest first. */
export const financialYearsBack = (
  rules: YearRules,
  newestDay: string,
  oldestDay: string
): FinancialYear[] => {
  const oldest = monthIndexOf(oldestDay);
  const years: FinancialYear[] = [];
  let year = financialYearOf(rules, newestDay);
  while (monthIndexOf(year.last) >= oldest) {
    years.push(year);
    year = yearBefore(rules, year);
  }
  return years;
};

/** A financial year's months, oldest first, as "YYYY-MM". */
export const monthsOfFinancialYear = (year: FinancialYear): string[] => {
  const first = monthIndexOf(year.start);
  return Array.from({ length: year.months }, (_, index) =>
    monthAt(first + index)
  );
};

/** Whether a "YYYY-MM" month has begun by a farm day: this month and every one before it. */
export const monthHasBegun = (month: string, today: string): boolean =>
  monthIndexOf(month) <= monthIndexOf(today);

/** Whether a year has ended by a farm day: its last month is before this one. */
const hasEnded = (lastMonthAfter: number, today: string): boolean =>
  lastMonthAfter <= monthIndexOf(today);

/** Why a change could not be made or taken back, in the word the farm refuses it with. */
export type YearChangeRefusal =
  | "year_change_not_a_year"
  | "year_change_changes_nothing"
  | "year_change_too_long"
  | "year_change_reaches_an_ended_year"
  | "year_change_not_the_last";

/**
 * Whether a change touches a year that has ended, as recorded or as taken back: the year it changes would have ended
 * under the rule before, or its Transition Year already has. Either way a year the farm has closed, and perhaps handed
 * to its accountant, would come out a different length — so it may not.
 */
const reachesAnEndedYear = (change: YearChange, today: string): boolean => {
  const changing = monthIndexOf(change.changingFrom);
  return (
    hasEnded(changing + MONTHS_A_YEAR, today) ||
    hasEnded(monthIndexOf(change.newFrom), today)
  );
};

/**
 * Why a change cannot be recorded, or nothing where it can. It must change a year that begins under the rules in
 * force, after the last change; begin its new rule in another month of the year, under two years later; and leave
 * every year that has ended as it was — so it changes this year at the earliest, as Myanmar fixed its 2019 income
 * year after it had begun.
 */
export const refusalOfChange = (
  rules: YearRules,
  change: YearChange,
  today: string
): YearChangeRefusal | null => {
  const last = rules.changes.at(-1);
  const afterTheLast =
    last === undefined ||
    monthIndexOf(change.changingFrom) >= monthIndexOf(last.newFrom);
  if (
    !afterTheLast ||
    financialYearStarting(rules, change.changingFrom) === null
  ) {
    return "year_change_not_a_year";
  }
  if (monthOfYear(change.newFrom) === monthOfYear(change.changingFrom)) {
    return "year_change_changes_nothing";
  }
  const length =
    monthIndexOf(change.newFrom) - monthIndexOf(change.changingFrom);
  if (length < 1 || length > LONGEST_TRANSITION) {
    return "year_change_too_long";
  }
  return reachesAnEndedYear(change, today)
    ? "year_change_reaches_an_ended_year"
    : null;
};

/** Why a change cannot be taken back, or nothing where it can: only the latest, and only while every year it would
 *  give back its old length has not ended. */
export const refusalOfWithdrawal = (
  rules: YearRules,
  change: YearChange,
  today: string
): YearChangeRefusal | null => {
  const last = rules.changes.at(-1);
  if (
    last?.changingFrom !== change.changingFrom ||
    last.newFrom !== change.newFrom
  ) {
    return "year_change_not_the_last";
  }
  return reachesAnEndedYear(change, today)
    ? "year_change_reaches_an_ended_year"
    : null;
};

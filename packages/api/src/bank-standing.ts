import { roundTaka } from "@OpenFarm/domain";

/** Whether a Bank Check still stands: what the farm believes that month ended on now, against what it
 *  believed when she read the statement. Agreeing with a figure nobody holds any more is not agreeing. */
export const hasGoneStale = (believedNow: number, believedThen: number) =>
  roundTaka(believedNow - believedThen) !== 0;

/** How an account — a Venture Account or a Farm Account — stands against its statements. */
export interface BankStanding {
  /** The last month anybody read the statement against the books, or nothing if nobody has. */
  lastCheckedMonth: string | null;
  /** The months still out, oldest first — every month a Settlement waits on, whether the statement
   *  disagreed or the farm has since changed its mind about what the month ended on. A month put right
   *  stops being one; a month nobody has looked at was never one — which is why the last month checked
   *  is said as well. */
  monthsOut: string[];
  /** Those of them the farm has since changed its mind about, oldest first. A different problem from a
   *  month that disagreed: this one needs the statement read again, that one needs explaining. */
  monthsStale: string[];
}

export const NEVER_CHECKED: BankStanding = {
  lastCheckedMonth: null,
  monthsOut: [],
  monthsStale: [],
};

/** One month's reading of a statement, as the standing reads it. */
export interface AMonthRead {
  forMonth: string;
  readMoney: number;
  expectedMoney: number;
}

/**
 * How one account stands against its statements, a Venture Account's or a Farm Account's alike: every month still
 * out, not only the last one read — an August that agreed says nothing about a July that did not.
 *
 * A month is out when its statement disagreed with what the farm believed when she read it, or when the farm has
 * since changed its mind about what the month ended on (stale). The checks come oldest first.
 */
export const standingOf = (
  checks: readonly AMonthRead[],
  believedNow: (month: string) => number
): BankStanding => {
  const standing: BankStanding = {
    ...NEVER_CHECKED,
    monthsOut: [],
    monthsStale: [],
  };
  for (const one of checks) {
    const stale = hasGoneStale(believedNow(one.forMonth), one.expectedMoney);
    if (stale) {
      standing.monthsStale.push(one.forMonth);
    }
    if (stale || roundTaka(one.readMoney - one.expectedMoney) !== 0) {
      standing.monthsOut.push(one.forMonth);
    }
    standing.lastCheckedMonth = one.forMonth;
  }
  return standing;
};

import type { Asking } from "@OpenFarm/domain";
import { ASKING } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";

import type { Tone } from "@/components/page";

/** How each standing is said and coloured wherever it is listed: missed is past its seven days, late is behind within
 *  them, due is a sum falling due this month. */
export const SUMS_SAID: Record<Asking, { word: MessageKey; tone: Tone }> = {
  missed: { word: "investors.sumsMissed", tone: "danger" },
  late: { word: "investors.sumsLate", tone: "warning" },
  due: { word: "investors.sumsDue", tone: "neutral" },
};

/** One row of this month's Monthly Sums as the call list reads it: whose, and where it stands. */
export interface SumToRing {
  investorId: string;
  standing: Asking;
  dueMoney: number;
}

/** What one Investor is to be rung about this month, across every Agreement they hold: the worst of it, and all that
 *  is to be asked for. */
export interface SumsSaid {
  standing: Asking;
  dueMoney: number;
}

/**
 * This month's Monthly Sums, one line per Investor: an Investor late on one Venture and missed on another is missed,
 * and is asked for both together — the Owner rings a person once, not once a paper.
 */
export const sumsByInvestor = (
  rows: readonly SumToRing[]
): Map<string, SumsSaid> => {
  const said = new Map<string, SumsSaid>();
  for (const one of rows) {
    const before = said.get(one.investorId);
    said.set(one.investorId, {
      standing:
        before && ASKING.indexOf(before.standing) < ASKING.indexOf(one.standing)
          ? before.standing
          : one.standing,
      dueMoney: (before?.dueMoney ?? 0) + one.dueMoney,
    });
  }
  return said;
};

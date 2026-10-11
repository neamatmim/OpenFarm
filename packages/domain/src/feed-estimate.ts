import type { RationLine, WeighedAnimal } from "./feed";
import { herdWeightOf, isByWeight, roundFeedTarget, sessionKgOf } from "./feed";
import type { FeedUnit } from "./feed-units";
import { roundMoney } from "./money";

export const FEED_ESTIMATE_BASES = ["rations", "recent"] as const;
export type FeedEstimateBasis = (typeof FEED_ESTIMATE_BASES)[number];

/** Calendar days, including leap February, without depending on the machine's time zone. */
export const feedMonthDays = (month: string): number => {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(month)) {
    throw new Error("A feed estimate needs a month in YYYY-MM form");
  }
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  const end = new Date(0);
  end.setUTCFullYear(year, number, 0);
  return end.getUTCDate();
};

export interface FeedEstimatePen {
  animals: readonly WeighedAnimal[];
  /** No published ration means these animals cannot be included in planned demand. */
  ration: readonly RationLine[] | null;
}

/** Daily demand across occupied pens. A missing weight in any pen keeps that item's total unknown. */
export const rationDemandOf = (
  pens: readonly FeedEstimatePen[],
  units: ReadonlyMap<string, FeedUnit>
) => {
  const perDay = new Map<string, number | null>();
  let animalsWithoutRation = 0;
  let estimatedWeights = 0;
  for (const pen of pens) {
    if (pen.animals.length === 0) {
      continue;
    }
    if (!pen.ration?.length) {
      animalsWithoutRation += pen.animals.length;
      continue;
    }
    const herd = herdWeightOf(pen.animals);
    if (pen.ration.some(isByWeight) && herd.weightKg !== null) {
      estimatedWeights += herd.unweighed;
    }
    for (const line of pen.ration) {
      const quantity = sessionKgOf(
        line,
        { animals: pen.animals.length, weightKg: herd.weightKg },
        1,
        units.get(line.feedItemId) ?? "kg"
      );
      const before = perDay.get(line.feedItemId);
      perDay.set(
        line.feedItemId,
        before === null || quantity === null ? null : (before ?? 0) + quantity
      );
    }
  }
  return { perDay, animalsWithoutRation, estimatedWeights };
};

/** A full month's demand at today's rate. Expired stock and bookkeeping deficits never cover future feed. */
export const feedEstimateOf = ({
  perDay,
  days,
  onHand,
  expiredLeft,
  unit,
  priceMoney,
}: {
  perDay: number | null;
  days: number;
  onHand: number;
  expiredLeft: number;
  unit: FeedUnit;
  priceMoney: number | null;
}) => {
  const available = roundFeedTarget(Math.max(0, onHand - expiredLeft), unit);
  const required =
    perDay === null ? null : roundFeedTarget(perDay * days, unit);
  const toBuy =
    required === null
      ? null
      : roundFeedTarget(Math.max(0, required - available), unit);
  const costOf = (quantity: number | null): number | null => {
    if (quantity === null) {
      return null;
    }
    if (quantity === 0) {
      return 0;
    }
    return priceMoney === null ? null : roundMoney(quantity * priceMoney);
  };
  return {
    perDay,
    available,
    required,
    toBuy,
    priceMoney,
    requiredMoney: costOf(required),
    toBuyMoney: costOf(toBuy),
  };
};

/** Known costs and counts of missing figures stay separate, so a partial total is never presented as complete. */
export const feedEstimateTotals = (
  lines: readonly ReturnType<typeof feedEstimateOf>[]
) => {
  let requiredMoney = 0;
  let toBuyMoney = 0;
  let unknownDemand = 0;
  let unpriced = 0;
  let itemsToBuy = 0;
  for (const line of lines) {
    requiredMoney += line.requiredMoney ?? 0;
    toBuyMoney += line.toBuyMoney ?? 0;
    if (line.required === null) {
      unknownDemand += 1;
    } else if (line.required > 0 && line.priceMoney === null) {
      unpriced += 1;
    }
    if (line.toBuy !== null && line.toBuy > 0) {
      itemsToBuy += 1;
    }
  }
  return {
    requiredMoney: roundMoney(requiredMoney),
    toBuyMoney: roundMoney(toBuyMoney),
    unknownDemand,
    unpriced,
    itemsToBuy,
  };
};

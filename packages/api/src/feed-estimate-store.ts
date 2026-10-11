import type { Database } from "@OpenFarm/db";
import { feedUnitOf, groupedBy } from "@OpenFarm/domain";
import type { FeedEstimateBasis } from "@OpenFarm/domain/feed-estimate";
import {
  feedEstimateOf,
  feedEstimateTotals,
  feedMonthDays,
  rationDemandOf,
} from "@OpenFarm/domain/feed-estimate";
import { expiryWindow } from "@OpenFarm/domain/lots";

import { AS_WEIGHED, linesOf, weighedAs } from "./feed-store";
import { isOnTheFarm } from "./instances-store";
import { stockOnHand } from "./stock-store";

/** A planning snapshot of today's herd, rations, prices and store; the chosen month supplies only its length. */
export const monthlyFeedEstimate = async (
  db: Pick<Database, "query" | "execute">,
  farm: { id: string; expiryWarnDays: number; feedDaysLow: number },
  now: Date,
  month: string,
  basis: FeedEstimateBasis
) => {
  const stock = await stockOnHand(
    db,
    farm.id,
    expiryWindow(now, farm.expiryWarnDays),
    {
      now,
      feedDaysLow: farm.feedDaysLow,
    }
  );
  // Read every animal and assignment in two queries, rather than one feeding-target query per pen.
  const [animals, assigned] =
    basis === "rations"
      ? await Promise.all([
          db.query.animal.findMany({
            where: { farmId: farm.id },
            columns: { penId: true, state: true },
            with: AS_WEIGHED,
          }),
          db.query.penRation.findMany({
            where: { farmId: farm.id },
            columns: { penId: true },
            with: {
              ration: {
                with: { currentVersion: { columns: { items: true } } },
              },
            },
          }),
        ])
      : [[], []];
  const rations = new Map(
    assigned.map((one) => [
      one.penId,
      one.ration.currentVersion
        ? linesOf(one.ration.currentVersion.items)
        : null,
    ])
  );
  const pens = groupedBy(animals.filter(isOnTheFarm), (one) => one.penId ?? "");
  const demand = rationDemandOf(
    [...pens].map(([penId, standing]) => ({
      animals: standing.map(weighedAs),
      ration: rations.get(penId) ?? null,
    })),
    new Map(stock.map((one) => [one.feedItemId, feedUnitOf(one.unit)]))
  );
  const days = feedMonthDays(month);
  const lines = stock
    .filter((one) => one.retiredAt === null)
    .map((one) => {
      const planned = demand.perDay.get(one.feedItemId);
      const rationPerDay = planned === undefined ? 0 : planned;
      const perDay = basis === "recent" ? one.fedPerDay : rationPerDay;
      return {
        feedItemId: one.feedItemId,
        nameBn: one.nameBn,
        nameEn: one.nameEn,
        unit: one.unit,
        expiredLeft: one.expiredLeft,
        missingWeight: basis === "rations" && planned === null,
        ...feedEstimateOf({
          perDay,
          days,
          onHand: one.onHand,
          expiredLeft: one.expiredLeft,
          unit: feedUnitOf(one.unit),
          priceMoney: one.averagePriceMoney ?? one.fodderPriceMoney,
        }),
      };
    });
  return {
    month,
    days,
    basis,
    asOf: now,
    animalsWithoutRation: demand.animalsWithoutRation,
    estimatedWeights: demand.estimatedWeights,
    lines,
    totals: feedEstimateTotals(lines),
  };
};

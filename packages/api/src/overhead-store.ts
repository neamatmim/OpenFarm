import type { Database } from "@OpenFarm/db";
import type { OverheadMoney, PenHistoryLine } from "@OpenFarm/domain";
import { headDaysIn, overheadsOver } from "@OpenFarm/domain";

import { herdCostOf } from "./cost-store";
import { THE_FARMS_PURSE } from "./money-store";

type Db = Pick<Database, "query">;

/** Money that went on the place and the people, and the day it moved. */
export type OverheadMoneyOn = OverheadMoney & { occurredAt: Date };

/**
 * Every Overhead in a stretch (CONTEXT.md: **Overhead**): money going out of the Farm's purse, entered by hand, that
 * no animal carries. A Herd Cost is the animals' — split across those who stood that month — so it is left out; money
 * under a marked Category that named no Side reached no animal, so it is in. A record's money (feed, medicine, cattle)
 * is the animals' by its record, and a Venture's money was never the Farm's.
 */
export const overheadMoneyIn = async (
  db: Db,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<OverheadMoneyOn[]> => {
  const rows = await db.query.moneyEvent.findMany({
    where: {
      farmId,
      purseVentureId: THE_FARMS_PURSE,
      source: "by_hand",
      direction: "out",
      occurredAt: { gte: from, lt: until },
    },
    columns: {
      amountBdt: true,
      occurredAt: true,
      side: true,
      categoryId: true,
    },
    with: {
      category: {
        columns: {
          id: true,
          nameBn: true,
          nameEn: true,
          chargedToAnimals: true,
        },
      },
    },
  });
  // Asked of the one rule that says what a Herd Cost is, so the costing and this can never disagree about a taka.
  return rows
    .filter(
      (one) =>
        herdCostOf({
          at: one.occurredAt,
          side: one.side,
          categoryId: one.categoryId,
          chargedToAnimals: one.category.chargedToAnimals,
          bdt: one.amountBdt,
        }) === null
    )
    .map((one) => ({
      categoryId: one.category.id,
      categoryBn: one.category.nameBn,
      categoryEn: one.category.nameEn,
      bdt: one.amountBdt,
      occurredAt: one.occurredAt,
    }));
};

/**
 * What running the place cost over a stretch, and a head a day over the days every Animal stood here in it — up to
 * now and no further, so this month's figure is over the days it has had and not the ones still to come.
 */
export const overheadsOf = (
  money: readonly OverheadMoneyOn[],
  history: readonly PenHistoryLine[],
  { from, until }: { from: Date; until: Date },
  now: Date
) =>
  overheadsOver({
    money: money.filter(
      (one) => one.occurredAt >= from && one.occurredAt < until
    ),
    headDays: headDaysIn(history, {
      from,
      until: until < now ? until : now,
    }),
  });

import type { Database } from "@OpenFarm/db";
import type { OverheadMoney, PenHistoryLine } from "@OpenFarm/domain";
import { headDaysIn, overheadsOver } from "@OpenFarm/domain";

import { herdCostOf } from "./cost-store";
import { isOutsideTheResults, THE_FARMS_PURSE } from "./money-store";

type Db = Pick<Database, "query">;

/** Money that went on the place and the people, and the day it moved. */
export type OverheadMoneyOn = OverheadMoney & { occurredAt: Date };

/**
 * Every Overhead in a stretch (CONTEXT.md: **Overhead**): money going out of the Farm's purse, entered by hand or drawn
 * against a wage, that no animal carries — a month's wage cost is its Wage Draws and what payday paid, never either
 * alone. A Herd Cost is the animals' — split across those who stood that month — so it is left out; money
 * under a marked Category that named no Side reached no animal, so it is in. A record's money (feed, medicine, cattle)
 * is the animals' by its record — but for a Vet's visit that named none and a Buying Trip that brought none home,
 * which are in — and a Venture's money was never the Farm's. Money outside the results (ADR 0027) is no Overhead.
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
      source: { in: ["by_hand", "wage_draw"] },
      direction: "out",
      occurredAt: { gte: from, lt: until },
    },
    columns: {
      amountMoney: true,
      occurredAt: true,
      side: true,
      categoryId: true,
    },
    with: {
      category: {
        columns: {
          id: true,
          key: true,
          nameBn: true,
          nameEn: true,
          chargedToAnimals: true,
        },
      },
    },
  });
  // Money a record booked that reached no animal — no Side to split it over, nobody to charge — is the place's, as
  // marked money naming no Side is. Left out of both, it was in no figure at all.
  const reachedNoAnimal = async (
    source: "vet_fee" | "buying_trip",
    ids: string[]
  ) => {
    const booked =
      ids.length === 0
        ? []
        : await db.query.moneyEvent.findMany({
            where: {
              farmId,
              purseVentureId: THE_FARMS_PURSE,
              source,
              sourceId: { in: ids },
              direction: "out",
            },
            columns: { amountMoney: true, occurredAt: true },
            with: {
              category: { columns: { id: true, nameBn: true, nameEn: true } },
            },
          });
    return booked.map((one) => ({
      categoryId: one.category.id,
      categoryBn: one.category.nameBn,
      categoryEn: one.category.nameEn,
      amount: one.amountMoney,
      occurredAt: one.occurredAt,
    }));
  };
  // A Vet's own fee for a visit that named no animal.
  const fees = await db.query.vetFee.findMany({
    where: { farmId, visitedOn: { gte: from, lt: until } },
    columns: { id: true },
    with: { animals: { columns: { animalId: true }, limit: 1 } },
  });
  const visits = await reachedNoAnimal(
    "vet_fee",
    fees.filter((one) => one.animals.length === 0).map((one) => one.id)
  );
  // A Buying Trip that brought nothing home: the day at the livestock market cost the lorry and the men all the same.
  // Once an Intake names it, it is that animal's, and leaves here.
  const trips = await db.query.buyingTrip.findMany({
    where: { farmId, wentOn: { gte: from, lt: until } },
    columns: { id: true },
    with: { intakes: { columns: { id: true }, limit: 1 } },
  });
  const emptyOutings = await reachedNoAnimal(
    "buying_trip",
    trips.filter((one) => one.intakes.length === 0).map((one) => one.id)
  );
  const handEntered = rows
    // Money outside the results (ADR 0027) — a loan, its principal paid back, a machine, the Owner's own — moved the
    // cash and cost the place nothing.
    .filter((one) => !isOutsideTheResults(one.category.key))
    // Asked of the one rule that says what a Herd Cost is, so the costing and this can never disagree about a taka.
    .filter(
      (one) =>
        herdCostOf({
          at: one.occurredAt,
          side: one.side,
          categoryId: one.categoryId,
          chargedToAnimals: one.category.chargedToAnimals,
          amount: one.amountMoney,
        }) === null
    )
    .map((one) => ({
      categoryId: one.category.id,
      categoryBn: one.category.nameBn,
      categoryEn: one.category.nameEn,
      amount: one.amountMoney,
      occurredAt: one.occurredAt,
    }));
  return [...handEntered, ...visits, ...emptyOutings];
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

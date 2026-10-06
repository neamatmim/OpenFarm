import type { Database } from "@OpenFarm/db";
import type { OwnedThenBy } from "@OpenFarm/domain";
import {
  farmDayOf,
  floorWeightOf,
  groupedBy,
  keepOrSell,
  keepRateOf,
  keptOver,
  perKgOfSales,
  priceOfAnimal,
  priceRangeFor,
  RECENT_SALES_DAYS,
  shrankPast,
  shrinkOf,
  soldUnder,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import type { FarmCosts } from "./cost-store";
import {
  boughtInOf,
  chargedOf,
  costToItsOwner,
  economicsOfAnimal,
  farmCosts,
  keepChargesOf,
} from "./cost-store";
import { tell } from "./notice";
import { projectionBasisOf } from "./projection-store";
import { fatteningRows } from "./ready-store";
import { ownedThenByOf } from "./venture-store";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The fattening side as the board and the Ready list read it. */
const ON_THE_SIDE = ["quarantine", "fattening", "ready_for_sale"] as const;

/**
 * What she has cost her owner now (`costToItsOwner`): what they paid to take her on, by the Internal Sale that last
 * brought her to them if one did, and her charges since. Her whole costing where her owner never paid for her.
 */
const costToHerOwner = (
  read: {
    costs: FarmCosts;
    ownedThenBy: OwnedThenBy;
    boughtIn: Awaited<ReturnType<typeof boughtInOf>>;
  },
  animal: FarmCosts["animals"][number],
  owner: string | null,
  economics: ReturnType<typeof economicsOfAnimal>
): number => {
  const back = read.boughtIn.get(animal.id);
  return (
    costToItsOwner(
      read.costs,
      read.ownedThenBy,
      animal,
      owner,
      back && back.toVentureId === owner ? back : undefined
    ) ?? (economics.purchaseMoney ?? 0) + chargedOf(economics)
  );
};

/**
 * Every animal on the fattening side priced for the Owner: what she has cost the farm so far — bought for, and every
 * charge the farm's costing puts on her — what she weighs, the price a kilo at which she pays for herself, and what she
 * might fetch at the low and the high price a kilo, with what each leaves over her cost. A Venture's animal is priced
 * at her Venture's plan's sale prices, the farm's own at its market price; either may not be set yet.
 *
 * The same costing the Venture's economics reads, narrowed to what she cost her owner now: what they paid to take her
 * on and her charges since, as their Settlement or books count her — never what her first buyer paid for one bought
 * across purses since. And
 * whether keeping her the days ahead pays: her keep over the days the farm reads a keep over, over the rate she is
 * gaining at now, set beside those same prices.
 */
export const pricesOnTheSide = async (
  db: Database,
  farm: {
    id: string;
    marketLowMoneyPerKg: number | null;
    marketHighMoneyPerKg: number | null;
    marketPriceSetAt: Date | null;
    keepReadDays: number;
    keepAheadDays: number;
    keepNeedsDays: number;
    keepRateGapDays: number;
  },
  now: Date
) => {
  const rows = await fatteningRows(db, farm.id, { states: ON_THE_SIDE }, now);
  const [costs, ownedThenBy, boughtIn] = await Promise.all([
    farmCosts(db, farm.id),
    ownedThenByOf(db, farm.id),
    boughtInOf(db, farm.id),
  ]);
  const owners = await db.query.animal.findMany({
    where: { farmId: farm.id, id: { in: rows.map((one) => one.id) } },
    columns: { id: true, ownerVentureId: true },
  });
  const ventureOf = new Map(owners.map((one) => [one.id, one.ownerVentureId]));
  // Each Venture's prices as its Projection reads them: its plan's, or those set before it had one.
  const ventureIds = [
    ...new Set(owners.flatMap((one) => one.ownerVentureId ?? [])),
  ];
  const bases = await Promise.all(
    ventureIds.map(
      async (id) => [id, await projectionBasisOf(db, farm.id, id)] as const
    )
  );
  const ventureRange = new Map(
    bases.flatMap(([id, basis]) =>
      basis
        ? [
            [
              id,
              {
                lowMoneyPerKg: basis.saleLowMoneyPerKg,
                highMoneyPerKg: basis.saleHighMoneyPerKg,
              },
            ] as const,
          ]
        : []
    )
  );
  const market =
    farm.marketLowMoneyPerKg !== null && farm.marketHighMoneyPerKg !== null
      ? {
          lowMoneyPerKg: farm.marketLowMoneyPerKg,
          highMoneyPerKg: farm.marketHighMoneyPerKg,
        }
      : null;
  const costed = new Map(costs.animals.map((one) => [one.id, one]));
  const stoodBy = groupedBy(costs.history, (line) => line.animalId);
  // Sales to a buyer only — an Internal Sale is a price the Owner set between purses, not one the market paid — and
  // of fattened stock only: a cow culled to a butcher is a Sale too, and would drag down what a fattened bull fetches.
  const since = new Date(now.getTime() - RECENT_SALES_DAYS * DAY_MS);
  const sold = await db.query.sale.findMany({
    where: { farmId: farm.id, soldAt: { gte: since } },
    columns: { priceMoney: true, weightKg: true },
    with: { animal: { columns: { side: true } } },
  });
  const recent = perKgOfSales(
    sold
      .filter((one) => one.animal?.side === "fattening")
      .map((one) => ({
        priceMoney: one.priceMoney,
        weightKg: Number(one.weightKg),
      }))
  );
  return {
    market: market ? { ...market, setAt: farm.marketPriceSetAt } : null,
    /** The Farm Parameter each animal's keep was read back over, in days. */
    keepReadDays: farm.keepReadDays,
    /** The Farm Parameter keeping each animal was worked ahead over, in days. */
    keepAheadDays: farm.keepAheadDays,
    /** What a kilo fetched in the farm's own sales over the last two months, as a reference when the market price is
     *  set; nothing where there were none. */
    recentSales: recent ? { ...recent, since, days: RECENT_SALES_DAYS } : null,
    animals: rows.flatMap((row) => {
      const animal = costed.get(row.id);
      if (!animal) {
        return [];
      }
      const economics = economicsOfAnimal(costs, animal);
      const venture = ventureOf.get(row.id) ?? null;
      const costMoney = costToHerOwner(
        { costs, ownedThenBy, boughtIn },
        animal,
        venture,
        economics
      );
      const range = priceRangeFor({
        ofHerVenture: venture ? (ventureRange.get(venture) ?? null) : null,
        market,
        inAVenture: venture !== null,
      });
      return [
        {
          id: row.id,
          tagNumber: row.tagNumber,
          costMoney,
          /** False while feed she ate has no price or a dose has no cost: her cost is short by those. */
          costIsWhole:
            economics.unpricedKg === 0 && economics.uncostedDoses === 0,
          /** False for one born here, whose cost has no purchase in it and so is not the whole of her. */
          bought: economics.purchaseMoney !== null,
          latestKg: row.view.latestKg,
          /** Where the price a kilo came from, or nothing while none is set for her. */
          from: range?.from ?? null,
          lowMoneyPerKg: range?.lowMoneyPerKg ?? null,
          highMoneyPerKg: range?.highMoneyPerKg ?? null,
          ...priceOfAnimal({
            costMoney,
            latestKg: row.view.latestKg,
            range,
          }),
          keep: keepOrSell({
            kept: keptOver({
              charges: keepChargesOf(costs, row.id),
              stood: stoodBy.get(row.id) ?? [],
              now,
              readDays: farm.keepReadDays,
            }),
            dailyGainKg: keepRateOf(
              row.view.recent,
              row.view.sinceIntake,
              farm.keepRateGapDays
            ),
            range,
            aheadDays: farm.keepAheadDays,
            needsDays: farm.keepNeedsDays,
          }),
        },
      ];
    }),
  };
};

/** Her last weighing before the Sale that the farm did not doubt — a flagged reading is passed over. */
const lastTrustedWeighIn = async (
  tx: Tx,
  farmId: string,
  animalId: string,
  soldAt: Date
): Promise<{ weightKg: number; at: Date } | null> => {
  const last = await tx.query.weighIn.findFirst({
    where: {
      farmId,
      animalId,
      weighedAt: { lte: soldAt },
      flaggedNote: { isNull: true },
    },
    orderBy: { weighedAt: "desc", id: "desc" },
    columns: { weightKg: true, weighedAt: true },
  });
  return last ? { weightKg: Number(last.weightKg), at: last.weighedAt } : null;
};

/**
 * Tells the Owner, in the evening's post, of a Sale that fetched less than she cost the farm or less than her weight
 * at the low price a kilo — her Venture's, or the farm's market price. A fattening animal only: a cow culled to a
 * butcher has cost her whole working life and was never going to fetch it back. The Owner's alone to hear, as her
 * cost is; the sale itself stands.
 *
 * Her weight is the heavier of the day's and her last trusted weighing less the farm's allowance for Shrink: a weight
 * typed low cannot lower the floor with it. The notice says which it was.
 */
export const tellIfSoldUnderCost = async (
  tx: Tx,
  farmId: string,
  saleId: string,
  now: Date
): Promise<void> => {
  const farm = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: {
      id: true,
      marketLowMoneyPerKg: true,
      marketHighMoneyPerKg: true,
      shrinkTellPercent: true,
    },
  });
  const sold = await tx.query.sale.findFirst({
    where: { id: saleId, farmId },
    columns: { priceMoney: true, weightKg: true, soldAt: true },
    with: {
      animal: {
        columns: {
          id: true,
          tagNumber: true,
          side: true,
          ownerVentureId: true,
        },
      },
    },
  });
  if (!farm || !sold?.animal || sold.animal.side !== "fattening") {
    return;
  }
  const { animal } = sold;
  const costs = await farmCosts(tx, farm.id);
  const costed = costs.animals.find((one) => one.id === animal.id);
  if (!costed) {
    return;
  }
  const economics = economicsOfAnimal(costs, costed);
  const costMoney = costToHerOwner(
    {
      costs,
      ownedThenBy: await ownedThenByOf(tx, farm.id),
      boughtIn: await boughtInOf(tx, farm.id),
    },
    costed,
    animal.ownerVentureId,
    economics
  );
  const basis = animal.ownerVentureId
    ? await projectionBasisOf(tx, farm.id, animal.ownerVentureId)
    : null;
  const range = priceRangeFor({
    ofHerVenture: basis
      ? {
          lowMoneyPerKg: basis.saleLowMoneyPerKg,
          highMoneyPerKg: basis.saleHighMoneyPerKg,
        }
      : null,
    market:
      farm.marketLowMoneyPerKg !== null && farm.marketHighMoneyPerKg !== null
        ? {
            lowMoneyPerKg: farm.marketLowMoneyPerKg,
            highMoneyPerKg: farm.marketHighMoneyPerKg,
          }
        : null,
    inAVenture: animal.ownerVentureId !== null,
  });
  const floor = floorWeightOf({
    saleKg: Number(sold.weightKg),
    last: await lastTrustedWeighIn(tx, farm.id, animal.id, sold.soldAt),
    soldAt: sold.soldAt,
    allowPercent: farm.shrinkTellPercent,
  });
  const under = soldUnder({
    priceMoney: sold.priceMoney,
    costMoney,
    weightKg: floor.weightKg,
    range,
  });
  if (!(under.underCost || under.underMarket)) {
    return;
  }
  await tell(
    tx,
    farm.id,
    {
      kind: "sold_under_cost",
      about: { id: saleId },
      facts: {
        tag: animal.tagNumber,
        priceMoney: sold.priceMoney,
        costMoney: Math.round(costMoney),
        lowMoney: under.lowMoney,
        floorKg: floor.weightKg,
        floorFrom: floor.from,
      },
    },
    now
  );
};

/**
 * Tells the Owner, in the evening's post, of a fattening animal that lost more than the farm allows between her last
 * trusted weighing and the sale's scale — the lorry, the livestock market, a night without water, or a weight typed low. Never on a
 * weighing older than the farm trusts for it; a cow culled to a butcher is not asked about. About the Sale, once.
 */
export const tellIfShrankTooMuch = async (
  tx: Tx,
  farmId: string,
  saleId: string,
  now: Date
): Promise<void> => {
  const farm = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: { shrinkTellPercent: true },
  });
  const sold = await tx.query.sale.findFirst({
    where: { id: saleId, farmId },
    columns: { weightKg: true, soldAt: true },
    with: { animal: { columns: { id: true, tagNumber: true, side: true } } },
  });
  if (!farm || !sold?.animal || sold.animal.side !== "fattening") {
    return;
  }
  const last = await lastTrustedWeighIn(
    tx,
    farmId,
    sold.animal.id,
    sold.soldAt
  );
  const shrink = last
    ? shrinkOf({
        lastKg: last.weightKg,
        lastAt: last.at,
        saleKg: Number(sold.weightKg),
        saleAt: sold.soldAt,
      })
    : null;
  if (!(last && shrink && shrankPast(shrink, farm.shrinkTellPercent))) {
    return;
  }
  await tell(
    tx,
    farmId,
    {
      kind: "large_shrink",
      about: { id: saleId },
      facts: {
        tag: sold.animal.tagNumber,
        lastKg: last.weightKg,
        lastOn: farmDayOf(last.at),
        saleKg: Number(sold.weightKg),
        percent: shrink.percent,
      },
    },
    now
  );
};

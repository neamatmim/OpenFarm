import type { Database } from "@OpenFarm/db";
import {
  groupedBy,
  keepOrSell,
  keepRateOf,
  keptOver,
  perKgOfSales,
  priceOfAnimal,
  priceRangeFor,
  soldUnder,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import {
  chargedOf,
  economicsOfAnimal,
  farmCosts,
  keepChargesOf,
} from "./cost-store";
import { tell } from "./notice";
import { projectionBasisOf } from "./projection-store";
import { fatteningRows } from "./ready-store";

/** How far back the farm's own sales are read for what a kilo has been fetching: two months of a market. */
const RECENT_SALES_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The fattening side as the board and the Ready list read it. */
const ON_THE_SIDE = ["quarantine", "fattening", "ready_for_sale"] as const;

/**
 * Every animal on the fattening side priced for the Owner: what she has cost the farm so far — bought for, and every
 * charge the farm's costing puts on her — what she weighs, the price a kilo at which she pays for herself, and what she
 * might fetch at the low and the high price a kilo, with what each leaves over her cost. A Venture's animal is priced
 * at her Venture's plan's sale prices, the farm's own at its market price; either may not be set yet.
 *
 * The same costing the Venture's economics reads, so an animal's cost here and on its Venture's page are one sum. And
 * whether keeping her the days ahead pays: her keep over the days the farm reads a keep over, over the rate she is
 * gaining at now, set beside those same prices.
 */
export const pricesOnTheSide = async (
  db: Database,
  farm: {
    id: string;
    marketLowBdtPerKg: number | null;
    marketHighBdtPerKg: number | null;
    marketPriceSetAt: Date | null;
    keepReadDays: number;
    keepAheadDays: number;
    keepNeedsDays: number;
    keepRateGapDays: number;
  },
  now: Date
) => {
  const rows = await fatteningRows(db, farm.id, { states: ON_THE_SIDE }, now);
  const costs = await farmCosts(db, farm.id);
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
                lowBdtPerKg: basis.saleLowBdtPerKg,
                highBdtPerKg: basis.saleHighBdtPerKg,
              },
            ] as const,
          ]
        : []
    )
  );
  const market =
    farm.marketLowBdtPerKg !== null && farm.marketHighBdtPerKg !== null
      ? {
          lowBdtPerKg: farm.marketLowBdtPerKg,
          highBdtPerKg: farm.marketHighBdtPerKg,
        }
      : null;
  const costed = new Map(costs.animals.map((one) => [one.id, one]));
  const stoodBy = groupedBy(costs.history, (line) => line.animalId);
  // Sales to a buyer only — an Internal Sale is a price the Owner set between purses, not one the market paid — and
  // of fattened stock only: a cow culled to a butcher is a Sale too, and would drag down what a fattened bull fetches.
  const since = new Date(now.getTime() - RECENT_SALES_DAYS * DAY_MS);
  const sold = await db.query.sale.findMany({
    where: { farmId: farm.id, soldAt: { gte: since } },
    columns: { priceBdt: true, weightKg: true },
    with: { animal: { columns: { side: true } } },
  });
  const recent = perKgOfSales(
    sold
      .filter((one) => one.animal?.side === "fattening")
      .map((one) => ({
        priceBdt: one.priceBdt,
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
      const costBdt = (economics.purchaseBdt ?? 0) + chargedOf(economics);
      const venture = ventureOf.get(row.id) ?? null;
      const range = priceRangeFor({
        ofHerVenture: venture ? (ventureRange.get(venture) ?? null) : null,
        market,
        inAVenture: venture !== null,
      });
      return [
        {
          id: row.id,
          tagNumber: row.tagNumber,
          costBdt,
          /** False while feed she ate has no price or a dose has no cost: her cost is short by those. */
          costIsWhole:
            economics.unpricedKg === 0 && economics.uncostedDoses === 0,
          /** False for one born here, whose cost has no purchase in it and so is not the whole of her. */
          bought: economics.purchaseBdt !== null,
          latestKg: row.view.latestKg,
          /** Where the price a kilo came from, or nothing while none is set for her. */
          from: range?.from ?? null,
          lowBdtPerKg: range?.lowBdtPerKg ?? null,
          highBdtPerKg: range?.highBdtPerKg ?? null,
          ...priceOfAnimal({
            costBdt,
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

/**
 * Tells the Owner, in the evening's post, of a Sale that fetched less than she cost the farm or less than her weight
 * at the low price a kilo — her Venture's, or the farm's market price. A fattening animal only: a cow culled to a
 * butcher has cost her whole working life and was never going to fetch it back. The Owner's alone to hear, as her
 * cost is; the sale itself stands.
 */
export const tellIfSoldUnderCost = async (
  tx: Tx,
  farmId: string,
  saleId: string,
  now: Date
): Promise<void> => {
  const farm = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: { id: true, marketLowBdtPerKg: true, marketHighBdtPerKg: true },
  });
  const sold = await tx.query.sale.findFirst({
    where: { id: saleId, farmId },
    columns: { priceBdt: true, weightKg: true },
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
  const costBdt = (economics.purchaseBdt ?? 0) + chargedOf(economics);
  const basis = animal.ownerVentureId
    ? await projectionBasisOf(tx, farm.id, animal.ownerVentureId)
    : null;
  const range = priceRangeFor({
    ofHerVenture: basis
      ? {
          lowBdtPerKg: basis.saleLowBdtPerKg,
          highBdtPerKg: basis.saleHighBdtPerKg,
        }
      : null,
    market:
      farm.marketLowBdtPerKg !== null && farm.marketHighBdtPerKg !== null
        ? {
            lowBdtPerKg: farm.marketLowBdtPerKg,
            highBdtPerKg: farm.marketHighBdtPerKg,
          }
        : null,
    inAVenture: animal.ownerVentureId !== null,
  });
  const under = soldUnder({
    priceBdt: sold.priceBdt,
    costBdt,
    weightKg: Number(sold.weightKg),
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
        priceBdt: sold.priceBdt,
        costBdt: Math.round(costBdt),
        lowBdt: under.lowBdt,
      },
    },
    now
  );
};

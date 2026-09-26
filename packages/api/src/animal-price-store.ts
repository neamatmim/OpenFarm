import type { Database } from "@OpenFarm/db";
import type { KeepCharge } from "@OpenFarm/domain";
import {
  groupedBy,
  keepOrSell,
  keepRateOf,
  keptOver,
  perKgOfSales,
  priceOfAnimal,
  priceRangeFor,
} from "@OpenFarm/domain";

import type { FarmCosts } from "./cost-store";
import { chargedOf, economicsOfAnimal, farmCosts } from "./cost-store";
import { projectionBasisOf } from "./projection-store";
import { fatteningRows } from "./ready-store";

/** How far back the farm's own sales are read for what a kilo has been fetching: two months of a market. */
const RECENT_SALES_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The fattening side as the board and the Ready list read it. */
const ON_THE_SIDE = ["quarantine", "fattening", "ready_for_sale"] as const;

/** What was charged to her keep, as the costing shares it out: her feed, her doses, her part of the Vet's fees for
 *  visits that named her, and her part of the Herd Costs. */
const keepChargesOf = (costs: FarmCosts, animalId: string): KeepCharge[] => [
  ...(costs.ofAnimal.feed.get(animalId) ?? []).map((one) => ({
    at: one.at,
    bdt: one.feedBdt,
    fed: true,
    priced: one.unpricedKg === 0,
  })),
  ...(costs.ofAnimal.doses.get(animalId) ?? []).map((one) => ({
    at: one.at,
    bdt: one.medicineBdt ?? 0,
    fed: false,
    priced: one.medicineBdt !== null,
  })),
  ...(costs.ofAnimal.vet.get(animalId) ?? []).map((one) => ({
    at: one.at,
    bdt: one.vetBdt,
    fed: false,
    priced: true,
  })),
  ...(costs.ofAnimal.herd.get(animalId) ?? []).map((one) => ({
    at: one.at,
    bdt: one.bdt,
    fed: false,
    priced: true,
  })),
];

/**
 * Every animal on the fattening side priced for the Owner: what she has cost the farm so far — bought for, and every
 * charge the farm's costing puts on her — what she weighs, the price a kilo at which she pays for herself, and what she
 * might fetch at the low and the high price a kilo, with what each leaves over her cost. A Venture's animal is priced
 * at her Venture's plan's sale prices, the farm's own at its market price; either may not be set yet.
 *
 * The same costing the Venture's economics reads, so an animal's cost here and on its Venture's page are one sum. And
 * whether keeping her another fortnight pays: her keep over her last four weeks, over the rate she is gaining at now,
 * set beside those same prices.
 */
export const pricesOnTheSide = async (
  db: Database,
  farm: {
    id: string;
    marketLowBdtPerKg: number | null;
    marketHighBdtPerKg: number | null;
    marketPriceSetAt: Date | null;
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
            }),
            dailyGainKg: keepRateOf(row.view.recent, row.view.sinceIntake),
            range,
          }),
        },
      ];
    }),
  };
};

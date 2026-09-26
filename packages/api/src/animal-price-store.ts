import type { Database } from "@OpenFarm/db";
import { priceOfAnimal, priceRangeFor } from "@OpenFarm/domain";

import { chargedOf, economicsOfAnimal, farmCosts } from "./cost-store";
import { fatteningRows } from "./ready-store";

/** The fattening side as the board and the Ready list read it. */
const ON_THE_SIDE = ["quarantine", "fattening", "ready_for_sale"] as const;

/**
 * Every animal on the fattening side priced for the Owner: what she has cost the farm so far — bought for, and every
 * charge the farm's costing puts on her — what she weighs, the price a kilo at which she pays for herself, and what she
 * might fetch at the low and the high price a kilo, with what each leaves over her cost. A Venture's animal is priced
 * at her Venture's projected prices, the farm's own at its market price; either may not be set yet.
 *
 * The same costing the Venture's economics reads, so an animal's cost here and on its Venture's page are one sum.
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
  const projected = await db.query.ventureProjection.findMany({
    where: { farmId: farm.id },
    columns: { ventureId: true, saleLowBdtPerKg: true, saleHighBdtPerKg: true },
  });
  const ventureRange = new Map(
    projected.map((one) => [
      one.ventureId,
      { lowBdtPerKg: one.saleLowBdtPerKg, highBdtPerKg: one.saleHighBdtPerKg },
    ])
  );
  const market =
    farm.marketLowBdtPerKg !== null && farm.marketHighBdtPerKg !== null
      ? {
          lowBdtPerKg: farm.marketLowBdtPerKg,
          highBdtPerKg: farm.marketHighBdtPerKg,
        }
      : null;
  const costed = new Map(costs.animals.map((one) => [one.id, one]));
  return {
    market: market ? { ...market, setAt: farm.marketPriceSetAt } : null,
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
        },
      ];
    }),
  };
};

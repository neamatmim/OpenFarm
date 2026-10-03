/**
 * What the farm's own recent buys of an animal her weight cost a kilo — the Manager's check at the haat against paying
 * over the odds, from the farm's own slips rather than a market nobody wrote down. The price alone, as the intake sheet's
 * own taka a kilo is: Hasil is the haat's toll, not what the animal fetched.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back the farm's buys are read: two months of a market, as its sales are. */
export const LAST_BUYS_DAYS = 60;

/** How near her weight a buy must be to be set beside hers: a light calf costs more a kilo than a heavy bull. */
export const SIMILAR_WEIGHT_SHARE = 0.15;

/** One animal the farm bought. */
export interface Bought {
  priceMoney: number;
  weightKg: number;
  arrivedAt: Date;
}

/**
 * The farm's own buys of the last two months within a sixth of her weight, weighed by weight: everything they cost over
 * everything they weighed. Nothing where there were none.
 */
export const lastBuysPerKg = (
  buys: readonly Bought[],
  { weightKg, now }: { weightKg: number; now: Date }
): { moneyPerKg: number; animals: number; days: number } | null => {
  if (weightKg <= 0) {
    return null;
  }
  const since = now.getTime() - LAST_BUYS_DAYS * DAY_MS;
  const near = buys.filter(
    (one) =>
      one.weightKg > 0 &&
      one.arrivedAt.getTime() >= since &&
      Math.abs(one.weightKg - weightKg) <= weightKg * SIMILAR_WEIGHT_SHARE
  );
  if (near.length === 0) {
    return null;
  }
  let amount = 0;
  let kg = 0;
  for (const one of near) {
    amount += one.priceMoney;
    kg += one.weightKg;
  }
  return {
    moneyPerKg: Math.round((amount / kg) * 100) / 100,
    animals: near.length,
    days: LAST_BUYS_DAYS,
  };
};

/** How far this price a kilo is over (or, less than nothing, under) the last buys', a percent to a whole one. */
export const againstLastBuys = (moneyPerKg: number, lastMoneyPerKg: number) =>
  Math.round(((moneyPerKg - lastMoneyPerKg) / lastMoneyPerKg) * 100);

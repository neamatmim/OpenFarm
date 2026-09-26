import { roundTaka } from "./money";

/**
 * What one animal might fetch against what she has cost the farm: the Owner's reference when a buyer names a price.
 * Worked from her latest weight and a low and a high price a kilo — never a promise, never on a paper, and never an
 * Investor's to read.
 */

/** A low and a high price a kilo of live weight. */
export interface PriceRange {
  lowBdtPerKg: number;
  highBdtPerKg: number;
}

/** One end of an animal's price: what she fetches at it, and what that leaves over her cost (negative short). */
export interface PriceEnd {
  priceBdt: number;
  marginBdt: number;
}

export interface AnimalPrice {
  /** The price a kilo at which she pays for herself; nothing without a weight to divide by. */
  breakEvenBdtPerKg: number | null;
  low: PriceEnd | null;
  high: PriceEnd | null;
}

/** What she might fetch at the low and the high price a kilo, what each leaves over her cost, and her break-even. */
export const priceOfAnimal = ({
  costBdt,
  latestKg,
  range,
}: {
  costBdt: number;
  latestKg: number | null;
  range: PriceRange | null;
}): AnimalPrice => {
  if (latestKg === null || latestKg <= 0) {
    return { breakEvenBdtPerKg: null, low: null, high: null };
  }
  const at = (bdtPerKg: number): PriceEnd => {
    const priceBdt = roundTaka(latestKg * bdtPerKg);
    return { priceBdt, marginBdt: roundTaka(priceBdt - costBdt) };
  };
  return {
    breakEvenBdtPerKg: roundTaka(costBdt / latestKg),
    low: range ? at(range.lowBdtPerKg) : null,
    high: range ? at(range.highBdtPerKg) : null,
  };
};

/**
 * The prices a kilo she is priced at: a Venture's animal at the prices its Venture is projected at, the farm's own at
 * the farm's market price. A Venture's animal is never priced at the farm's market price — what her Venture expects is
 * the Owner's to set on the Venture — so she has none until it is.
 */
export const priceRangeFor = ({
  ofHerVenture,
  market,
  inAVenture,
}: {
  ofHerVenture: PriceRange | null;
  market: PriceRange | null;
  inAVenture: boolean;
}): (PriceRange & { from: "venture" | "market" }) | null => {
  if (inAVenture) {
    return ofHerVenture ? { ...ofHerVenture, from: "venture" } : null;
  }
  return market ? { ...market, from: "market" } : null;
};

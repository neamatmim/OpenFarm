import { roundKg } from "./feed";
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

/**
 * What a kilo fetched across some of the farm's sales: everything they fetched over everything they weighed — so a
 * heavy bull counts for his weight, not as one vote beside a light one. Nothing where nothing with a weight was sold.
 */
export const perKgOfSales = (
  sales: readonly { priceBdt: number; weightKg: number }[]
): { bdtPerKg: number; animals: number } | null => {
  const weighed = sales.filter((one) => one.weightKg > 0);
  const kg = weighed.reduce((sum, one) => sum + one.weightKg, 0);
  if (kg === 0) {
    return null;
  }
  const bdt = weighed.reduce((sum, one) => sum + one.priceBdt, 0);
  return { bdtPerKg: roundTaka(bdt / kg), animals: weighed.length };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The fewest days back the farm may read an animal's keep over: a fortnight, the time between two Weigh-ins. Fewer,
 *  and one Feeding missed or one dose given would set what a day of her costs. How many is a Farm Parameter (the
 *  Owner's, four weeks unless the Owner says otherwise); this is its floor. */
export const FEWEST_KEEP_READ_DAYS = 14;

/** Fewer days on the farm than this say nothing about a day of her keep: a beast a few days off the lorry has been
 *  fed, but not for long enough to be a rate. */
export const KEEP_NEEDS_DAYS = 7;

/** Two readings closer together than this say more about what she ate and drank that morning than what she put on:
 *  a full gut alone moves a bull several kilos, which over three days reads as a kilo a day either way. */
export const KEEP_RATE_NEEDS_DAYS = 7;

/**
 * The daily gain keeping her is weighed on: between her last two readings, because a bull who has stopped gaining has
 * stopped paying for his keep — unless they are under a week apart, when it is her gain since she came instead. Nothing
 * while neither spans a week.
 */
export const keepRateOf = (
  recent: { dailyGainKg: number; overDays: number } | null,
  sinceIntake: { dailyGainKg: number; overDays: number } | null
): number | null => {
  const longEnough = [recent, sinceIntake].find(
    (basis) => basis !== null && KEEP_RATE_NEEDS_DAYS <= basis.overDays
  );
  return longEnough?.dailyGainKg ?? null;
};

/**
 * One thing charged to her keep: her share of a Feeding, a dose she was given, her share of the Vet's fee for a visit
 * that named her, or her share of a Herd Cost (the Owner's choice, 2026-09-27: what she is dosed with and what the Vet
 * charges to see her are part of what keeping her costs). Not the Hasil or a Trip, which were paid to move her, not to
 * keep her.
 */
export interface KeepCharge {
  at: Date;
  bdt: number;
  /** A Feeding: what says she was fed at all. */
  fed: boolean;
  /** False for feed with no price, or a dose of something the farm never bought: her keep is short by it. */
  priced: boolean;
}

/** What keeping her has cost over the days her keep is read back over. */
export interface Kept {
  bdt: number;
  /** How many of those days she stood on the farm. */
  days: number;
  /** Whether any Feeding was charged to her in them: without one her keep is not known, which is not the same as free. */
  fed: boolean;
  /** False when some feed or a dose in it had no price. */
  whole: boolean;
}

/** Whether something happened inside the days her keep is read over: the one window anything set beside her keep — a
 *  dairy cow's milk, say — has to be read over too, or the two are not the same days. */
export const inTheKeepWindow = (
  at: Date,
  now: Date,
  readDays: number
): boolean =>
  now.getTime() - readDays * DAY_MS <= at.getTime() &&
  at.getTime() <= now.getTime();

/** What she was charged for her keep over the days it is read back over, and how many of those days she was here to be
 *  kept. */
export const keptOver = ({
  charges,
  stood,
  now,
  readDays,
}: {
  charges: readonly KeepCharge[];
  /** Where she stood and when, on any Side: a spell before she came, or after she left, is none of her keep. */
  stood: readonly { from: Date; until: Date | null }[];
  now: Date;
  /** The Farm Parameter: how many days back her keep is read. */
  readDays: number;
}): Kept => {
  const from = now.getTime() - readDays * DAY_MS;
  const inside = charges.filter((one) =>
    inTheKeepWindow(one.at, now, readDays)
  );
  let ms = 0;
  for (const spell of stood) {
    const start = Math.max(spell.from.getTime(), from);
    const end = Math.min((spell.until ?? now).getTime(), now.getTime());
    ms += Math.max(0, end - start);
  }
  return {
    bdt: inside.reduce((sum, one) => sum + one.bdt, 0),
    days: ms / DAY_MS,
    fed: inside.some((one) => one.fed),
    whole: inside.every((one) => one.priced),
  };
};

/**
 * Whether keeping her the days ahead pays: what each kilo she is putting on now costs, set beside the price a kilo
 * she is priced at. At or under the low price it pays whatever she fetches; over the high price she costs more to keep
 * than she puts on; between the two, what she fetches decides.
 */
export const KEEPING = ["pays", "close", "costs_more"] as const;
export type Keeping = (typeof KEEPING)[number];

/** Why the farm cannot say yet what keeping her is worth. */
export type KeepUnknown = "too_new" | "not_fed" | "no_rate";

/** What the days ahead's kilos fetch at one end of her price, and what that leaves over those days' keep. */
export interface AheadEnd {
  worthBdt: number;
  overKeepBdt: number;
}

export type KeepOrSell =
  | { known: false; because: KeepUnknown }
  | {
      known: true;
      keepBdtPerDay: number;
      /** The daily gain it was worked on. */
      dailyGainKg: number;
      /** What each kilo she is putting on now costs; nothing while she is putting none on. */
      costOfGainNowBdt: number | null;
      /** The days ahead at the rate she is going: how many, the kilos, their keep, and what they fetch at each end. */
      ahead: {
        days: number;
        gainKg: number;
        keepBdt: number;
        low: AheadEnd | null;
        high: AheadEnd | null;
      };
      /** Nothing while no price a kilo is set for her. */
      keeping: Keeping | null;
      /** False when some feed or a dose in her keep had no price: it is short by that, and so kinder to keeping her. */
      whole: boolean;
    };

const keepingAt = (
  costOfGainNow: number | null,
  range: PriceRange
): Keeping => {
  // A beast putting nothing on costs more to keep at any price.
  if (costOfGainNow === null || range.highBdtPerKg < costOfGainNow) {
    return "costs_more";
  }
  return costOfGainNow <= range.lowBdtPerKg ? "pays" : "close";
};

/**
 * Keep her or sell her, as money: what a day of her keep costs over her daily gain is what a kilo she is putting on now
 * costs, and the days ahead at that rate are what keeping her would add at each end of her price. What she has cost
 * already is spent whichever the Owner chooses, so it has no say here — that is her Margin's question, not this one.
 *
 * Unknown, and said why, while she has been here under a week, has had no Feeding charged to her in the days read, or has
 * no rate of gain to work from. A figure for the Owner, never a decision.
 */
export const keepOrSell = ({
  kept,
  dailyGainKg,
  range,
  aheadDays,
}: {
  kept: Kept;
  dailyGainKg: number | null;
  range: PriceRange | null;
  /** The Farm Parameter: how many days ahead keeping her is worked. Sizes what the days ahead come to, never whether
   *  keeping her pays — that is what a kilo costs to put on against what it fetches, however far ahead it is worked. */
  aheadDays: number;
}): KeepOrSell => {
  if (kept.days < KEEP_NEEDS_DAYS) {
    return { known: false, because: "too_new" };
  }
  if (!kept.fed) {
    return { known: false, because: "not_fed" };
  }
  if (dailyGainKg === null) {
    return { known: false, because: "no_rate" };
  }
  const perDay = kept.bdt / kept.days;
  const costOfGainNow = dailyGainKg > 0 ? perDay / dailyGainKg : null;
  const gainKg = dailyGainKg * aheadDays;
  const keepBdt = roundTaka(perDay * aheadDays);
  // Each end said from the figures as they are shown, so what is left over is what the two lines come to.
  const at = (bdtPerKg: number): AheadEnd => {
    const worthBdt = roundTaka(gainKg * bdtPerKg);
    return { worthBdt, overKeepBdt: roundTaka(worthBdt - keepBdt) };
  };
  return {
    known: true,
    keepBdtPerDay: roundTaka(perDay),
    dailyGainKg,
    costOfGainNowBdt: costOfGainNow === null ? null : roundTaka(costOfGainNow),
    ahead: {
      days: aheadDays,
      gainKg: roundKg(gainKg),
      keepBdt,
      low: range ? at(range.lowBdtPerKg) : null,
      high: range ? at(range.highBdtPerKg) : null,
    },
    keeping: range ? keepingAt(costOfGainNow, range) : null,
    whole: kept.whole,
  };
};

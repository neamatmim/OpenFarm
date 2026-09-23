/**
 * What a Pen is fed, and how much of it one session calls for.
 *
 * The farm states a Ration the way a farmer states it — so many kilos of each Feed Item per
 * animal per day — and the number that reaches the person with the bucket is worked out from
 * the herd standing in that Pen at that moment. Nobody types a figure the farm already knows,
 * and a Pen that gains three animals is fed for three more without anybody remembering to
 * change anything.
 */

/** Feed is weighed on a barn scale; a hundred grams is as fine as the answer can honestly be. */
export const KG_DECIMALS = 1;
const KG_SCALE = 10 ** KG_DECIMALS;

/** Kilos as the record keeps them — the one rounding, shared by the arithmetic and the
 *  column, so the two cannot drift apart. */
export const roundKg = (value: number): number =>
  Math.round(value * KG_SCALE) / KG_SCALE;

/** Under a kilo, feed is weighed on a small scale: ten grams is as fine as salt and minerals are measured. */
const SMALL_SCALE_KG = 1;
const SMALL_SCALE = 100;

/**
 * A quantity of feed as the farm weighs it: a kilo or more on the barn scale, to the nearest 100 g; less than that on a
 * small scale, to the nearest 10 g. And a need is never rounded away: thirty grams of salt for two bulls is thirty
 * grams, not the nothing a barn scale would read, and a feeder told nothing gives nothing.
 */
export const roundFeedKg = (value: number): number => {
  if (value >= SMALL_SCALE_KG) {
    return roundKg(value);
  }
  const grams = Math.round(value * SMALL_SCALE) / SMALL_SCALE;
  return value > 0 && grams === 0 ? 1 / SMALL_SCALE : grams;
};

/** The most one animal can sensibly be given of one Item in a day. */
export const MAX_KG_PER_ANIMAL_PER_DAY = 100;

/** The most of one Item a day for every hundred kilos an animal weighs — a fattening bull eats about three. */
export const MAX_KG_PER_100KG_PER_DAY = 20;

/** How many kilos of body weight a line by weight is stated for. */
const PER_WEIGHT_KG = 100;

/**
 * One line of a Ration: so much of a Feed Item for each animal a day, or so much for every hundred kilos of body weight
 * a day. Each line says which: salt and minerals go by the head, while grass, straw and concentrate grow with the
 * animals. A line written before a Ration could go by weight is by the head.
 */
export type RationLine =
  | {
      feedItemId: string;
      kgPerAnimalPerDay: number;
      kgPer100KgPerDay?: undefined;
    }
  | {
      feedItemId: string;
      kgPer100KgPerDay: number;
      kgPerAnimalPerDay?: undefined;
    };

/** A line that grows with the animals' weight. */
export const isByWeight = (
  line: RationLine
): line is Extract<RationLine, { kgPer100KgPerDay: number }> =>
  line.kgPer100KgPerDay !== undefined;

/** One Feed Item's share of one session, for the animals actually standing in the Pen. */
export const perSessionKg = (
  kgPerAnimalPerDay: number,
  animals: number,
  sessionsPerDay: number
): number => {
  if (sessionsPerDay < 1) {
    throw new Error("A ration is fed at least once a day");
  }
  return roundFeedKg((kgPerAnimalPerDay * animals) / sessionsPerDay);
};

/** One animal as feeding weighs her: her latest Weigh-in, or what she weighed at her Intake, and when. */
export interface WeighedAnimal {
  weightKg: number | null;
  weighedAt: Date | null;
}

/**
 * What a Pen weighs, as a Ration by weight is fed on: every animal's latest weight, and an animal nobody has weighed
 * counted at the average of those who have been — so one calf born last night does not stop the Pen being fed.
 * Nothing when nobody in the Pen was ever weighed: a figure made up for the whole Pen is not a weight.
 *
 * As weighed, never projected: the oldest weight used is said beside it, so a Pen fed on last month's scale reading
 * shows it, and weighing it again is the remedy.
 */
export const herdWeightOf = (
  animals: readonly WeighedAnimal[]
): {
  weightKg: number | null;
  weighed: number;
  unweighed: number;
  oldestWeighedAt: Date | null;
} => {
  const known = animals.flatMap((one) =>
    one.weightKg !== null && one.weightKg > 0
      ? [{ weightKg: one.weightKg, weighedAt: one.weighedAt }]
      : []
  );
  const unweighed = animals.length - known.length;
  if (known.length === 0) {
    return { weightKg: null, weighed: 0, unweighed, oldestWeighedAt: null };
  }
  let total = 0;
  let oldest: Date | null = null;
  for (const one of known) {
    total += one.weightKg;
    if (one.weighedAt && (!oldest || one.weighedAt < oldest)) {
      oldest = one.weighedAt;
    }
  }
  return {
    weightKg: roundKg(total + (total / known.length) * unweighed),
    weighed: known.length,
    unweighed,
    oldestWeighedAt: oldest,
  };
};

/**
 * One Feed Item's share of one session: by the head for the animals standing there, or by weight for what the Pen
 * weighs. Nothing for a line by weight in a Pen nobody has weighed — the screen says to weigh it, rather than a zero
 * that reads as "give none".
 */
export const sessionKgOf = (
  line: RationLine,
  herd: { animals: number; weightKg: number | null },
  sessionsPerDay: number
): number | null => {
  if (!isByWeight(line)) {
    return perSessionKg(line.kgPerAnimalPerDay, herd.animals, sessionsPerDay);
  }
  if (herd.weightKg === null) {
    return null;
  }
  if (sessionsPerDay < 1) {
    throw new Error("A ration is fed at least once a day");
  }
  return roundFeedKg(
    (line.kgPer100KgPerDay * herd.weightKg) / PER_WEIGHT_KG / sessionsPerDay
  );
};

/**
 * The weights a Ration is written for — a grower's 150 to 250 kg, a finisher's from 250 — so a bull the scale says has
 * grown out of it, or one too small for the bulls he is penned with, is pointed out to be moved. From is where it
 * starts and To where the next one takes over: a bull of exactly 250 kg belongs to the finisher. Either end may be
 * open: a starter has no From, a last finisher no To.
 */
export interface WeightBand {
  fromKg: number | null;
  toKg: number | null;
}

/** Where a weight stands against a Ration's band: in it, grown past it, or not yet up to it. */
export type BandStanding = "fits" | "outgrown" | "too_light";

export const bandStanding = (
  weightKg: number,
  { fromKg, toKg }: WeightBand
): BandStanding => {
  if (toKg !== null && weightKg >= toKg) {
    return "outgrown";
  }
  if (fromKg !== null && weightKg < fromKg) {
    return "too_light";
  }
  return "fits";
};

/** A band that says nothing is no band; one whose From is not below its To fits nobody. */
export const findBandProblems = ({ fromKg, toKg }: WeightBand): string[] => {
  const problems: string[] = [];
  for (const [field, value] of [
    ["fromKg", fromKg],
    ["toKg", toKg],
  ] as const) {
    if (value !== null && !(Number.isFinite(value) && value > 0)) {
      problems.push(`band.${field}: a weight above nothing`);
    }
  }
  if (fromKg !== null && toKg !== null && fromKg >= toKg) {
    problems.push("band: From must be below To");
  }
  return problems;
};

/** What a line calls for in a day, and the most it may: by the head or by weight, whichever it is. */
const dailyOf = (line: RationLine) =>
  isByWeight(line)
    ? {
        amount: line.kgPer100KgPerDay,
        most: MAX_KG_PER_100KG_PER_DAY,
        field: "kgPer100KgPerDay",
        per: "per 100 kg of body weight",
      }
    : {
        amount: line.kgPerAnimalPerDay,
        most: MAX_KG_PER_ANIMAL_PER_DAY,
        field: "kgPerAnimalPerDay",
        per: "an animal",
      };

/** What is wrong with a Ration, in the Manager's terms rather than the parser's. */
export const findRationProblems = (ration: {
  items: RationLine[];
}): string[] => {
  const problems: string[] = [];
  if (ration.items.length === 0) {
    problems.push("items: a ration needs something in it");
  }
  const seen = new Set<string>();
  for (const [index, line] of ration.items.entries()) {
    if (seen.has(line.feedItemId)) {
      problems.push(`items[${index}]: that feed is already in this ration`);
    }
    seen.add(line.feedItemId);
    const { amount, most, field, per } = dailyOf(line);
    if (!Number.isFinite(amount) || amount <= 0 || amount > most) {
      problems.push(
        `items[${index}].${field}: between nothing and ${most} kg a day ${per}`
      );
    }
  }
  return problems;
};

/** What a Step that feeds a Pen says went out, per Feed Item. */
export interface FeedingEntryLine {
  feedItemId: string;
  givenKg: number;
  leftoverKg?: number;
}

export interface FeedingLine {
  feedItemId: string;
  targetKg: number;
  givenKg: number;
  leftoverKg: number;
}

/**
 * How far under its Feeding Target a session came: the Feed Item that fell shortest.
 *
 * Item by item rather than in total, because a Feed Item is measured in its own unit — straw
 * in bales, molasses in litres — and a total that adds bales to litres is arithmetic that
 * means nothing. It is also the answer the farm wants: a Pen that got its silage and none of
 * its concentrate has a problem, and a total would average it away.
 *
 * Leftover counts against what was eaten, not against what was given: the trough is the
 * measure of the meal.
 */
export const shortfallPercent = (lines: FeedingLine[]): number => {
  let worst = 0;
  for (const line of lines) {
    if (line.targetKg <= 0) {
      continue;
    }
    const eaten = Math.max(line.givenKg - line.leftoverKg, 0);
    const short = Math.round(((line.targetKg - eaten) / line.targetKg) * 100);
    worst = Math.max(worst, short);
  }
  return Math.max(worst, 0);
};

/** Was this session short enough to be worth saying out loud? */
export const isShortFed = (lines: FeedingLine[], tolerancePercent: number) =>
  shortfallPercent(lines) > tolerancePercent;

/** More than this share of what a Pen was given of one Feed Item, left in the trough, is feed the farm paid for and
 *  the animals did not want: the Ration gives them more of it than they eat. */
export const WASTING_LEFTOVER_PERCENT = 10;

/** Fewer sessions than this — three days fed twice — say nothing about a Pen's appetite either way. */
export const SESSIONS_TO_JUDGE = 6;

/**
 * Where a Pen's Leftovers of one Feed Item stand over a period.
 *
 * - `wasting`: more than the farm's share of it left behind — give them less of it.
 * - `all_eaten`: the Pen's whole trough never left with a scrap, of anything, at any session — they may want more
 *   than they are given, or nobody is writing the Leftovers down. Either is worth a look; neither is waste. Asked of the
 *   trough rather than the item: a few grams of minerals mixed into the concentrate are never left on their own, and a
 *   Pen that clears them and leaves its napier is a Pen fed enough.
 * - `fine`: a little left now and then, which is what a Pen fed enough looks like.
 * - `too_few`: not fed often enough in the period to say.
 */
export type LeftoverStanding = "wasting" | "all_eaten" | "fine" | "too_few";

/** One Pen's feeding of one Feed Item over a period, added up. */
export interface LeftoverTally {
  givenKg: number;
  leftoverKg: number;
  /** The sessions it was fed at, and how many of them left any behind. */
  sessions: number;
  sessionsWithLeftover: number;
}

/** What share of what was given came back, as a whole percent: nothing given, nothing wasted. */
export const leftoverPercent = ({
  givenKg,
  leftoverKg,
}: Pick<LeftoverTally, "givenKg" | "leftoverKg">): number =>
  givenKg > 0 ? Math.round((leftoverKg / givenKg) * 100) : 0;

export const leftoverStanding = (
  tally: LeftoverTally,
  /** Whether the Pen left anything of any Feed Item at any session in the period. */
  { penLeftAnything }: { penLeftAnything: boolean }
): LeftoverStanding => {
  if (tally.sessions < SESSIONS_TO_JUDGE) {
    return "too_few";
  }
  if (leftoverPercent(tally) > WASTING_LEFTOVER_PERCENT) {
    return "wasting";
  }
  return penLeftAnything ? "fine" : "all_eaten";
};

/** A maund — the mon a Bangladeshi feed trader weighs in — in kilograms. Shown beside kg on a feed
 *  purchase only, because that is the one place the farm is handed a number in maunds. */
export const MAUND_KG = 37.324;

/** Kilograms as maunds, to the kilo's own precision: what the trader's slip will say. */
export const maundsOf = (kg: number): number => roundKg(kg / MAUND_KG);

const PAISA_IN_A_TAKA = 100;
const roundTaka = (value: number): number =>
  Math.round(value * PAISA_IN_A_TAKA) / PAISA_IN_A_TAKA;

/** Something that moved feed in or out of the store, as the store's price is worked out from it. */
export type StockMovement =
  | {
      kind: "in";
      at: Date;
      quantity: number;
      /** What the lot cost; null for a Harvest from the farm's own fields. */
      priceBdt: number | null;
    }
  | { kind: "out"; at: Date; quantity: number }
  /** A Stock Count: what was really there. It wins over whatever the store was thought to hold. */
  | { kind: "count"; at: Date; counted: number };

/** Where a movement sorts among others at the same instant: what came in, then what went out, then
 *  the count that says what was left. */
const MOVEMENT_ORDER: Record<StockMovement["kind"], number> = {
  in: 0,
  out: 1,
  count: 2,
};

/** The store replayed, one movement at a time, in the order things happened. */
const replayStore = (
  movements: readonly StockMovement[],
  afterEach?: (at: Date, price: number | null) => void
): { onHand: number; price: number | null } => {
  const inOrder = movements.toSorted(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      // Feed that came in on a day is in the store before that day's Feedings take from it.
      MOVEMENT_ORDER[a.kind] - MOVEMENT_ORDER[b.kind]
  );
  let onHand = 0;
  let value = 0;
  let price: number | null = null;
  for (const one of inOrder) {
    if (one.kind === "count") {
      // The count is what is there. What it cost a unit does not change because somebody counted:
      // the store is worth what was counted, at the price it already had.
      onHand = one.counted;
      value = price === null ? 0 : one.counted * price;
    } else if (one.kind === "out") {
      const unitPrice = price ?? 0;
      onHand -= one.quantity;
      value = onHand > 0 ? Math.max(0, value - unitPrice * one.quantity) : 0;
    } else {
      const cost = one.priceBdt ?? 0;
      // A store at or below nothing starts again from what came in: there is nothing left to average the
      // new lot with, and what the pens already ate of it before it was written down was charged when
      // they ate it — so only the part still standing carries its share of the cost.
      if (onHand <= 0) {
        const standing = Math.max(0, one.quantity + onHand);
        onHand += one.quantity;
        value = one.quantity > 0 ? (cost * standing) / one.quantity : 0;
      } else {
        onHand += one.quantity;
        value += cost;
      }
      if (one.priceBdt !== null || price !== null) {
        price = onHand > 0 ? value / onHand : price;
      }
    }
    afterEach?.(one.at, price);
  }
  return { onHand, price };
};

/**
 * What is in the store, and what a unit of it cost: a moving weighted average, recomputed on each
 * Purchase over what is already there (the feed decision, 2026-09-10: no FIFO).
 *
 * Replayed in the order things happened. A Purchase adds its quantity and what it cost; a Harvest adds
 * its quantity at no cost, so fodder from the farm's own fields contributes nothing to what the feed
 * it is mixed with is charged at; a Feeding takes quantity out at the price of the moment and leaves the
 * price where it was; a Stock Count sets what is there and leaves the price alone. What the pens are
 * charged for, over time, is what the farm paid.
 *
 * `asOf` reads the store as it stood then — what a Feeding that day was charged at. The price is null
 * for feed never bought; with the store empty or below nothing it is the last price it had, because a
 * price of nothing would say the next Feeding cost nothing.
 */
export const stockLedger = (
  movements: readonly StockMovement[],
  asOf?: Date
): { onHand: number; averagePriceBdt: number | null } => {
  const { onHand, price } = replayStore(
    asOf ? movements.filter((one) => one.at <= asOf) : movements
  );
  return {
    onHand: roundKg(onHand),
    averagePriceBdt: price === null ? null : roundTaka(price),
  };
};

/**
 * What a unit of a Feed Item cost at any moment, from one replay of its store: what a Feeding at that
 * moment is charged at. The same price `stockLedger` reads as of that moment, without replaying the store
 * once for every Feeding in a year — and not yet rounded, so that it is rounded once, where it is added up.
 */
export const priceHistory = (
  movements: readonly StockMovement[]
): ((at: Date) => number | null) => {
  const steps: { at: number; price: number | null }[] = [];
  replayStore(movements, (at, price) => {
    steps.push({ at: at.getTime(), price });
  });
  const priceAt = (at: Date): number | null => {
    const moment = at.getTime();
    let low = 0;
    let high = steps.length;
    // The last step at or before the moment.
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((steps[middle]?.at ?? 0) <= moment) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return steps[low - 1]?.price ?? null;
  };
  return priceAt;
};

/**
 * When the store last fell below a level: the moment a movement took it from at or above the level to
 * under it. What a low-stock notice is about — once each time the store runs low, whether it was
 * brought back up by a lorry or by a count that found more than was thought. Null when it has never
 * been at the level and then fallen from it: a store that starts below it fell the moment it started.
 */
export const lastFellBelow = (
  movements: readonly StockMovement[],
  level: number
): Date | null => {
  const inOrder = movements.toSorted(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      MOVEMENT_ORDER[a.kind] - MOVEMENT_ORDER[b.kind]
  );
  let onHand = 0;
  let fell: Date | null = null;
  for (const one of inOrder) {
    const before = onHand;
    if (one.kind === "count") {
      onHand = one.counted;
    } else {
      onHand += one.kind === "in" ? one.quantity : -one.quantity;
    }
    if (onHand < level && (before >= level || fell === null)) {
      fell = one.at;
    }
  }
  return onHand < level ? fell : null;
};

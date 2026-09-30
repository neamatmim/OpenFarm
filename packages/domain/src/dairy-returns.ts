import type { Gap, ReturnBooks } from "./cattle-returns";
import { whatHappenedTo } from "./cattle-returns";
import { milkPriceOf } from "./cull";
import { farmDayOf, startOfFarmDay } from "./farm-clock";
import { chargesInHolding, howSheLeft } from "./holding";
import type { Left } from "./holding";
import { roundLitres } from "./milk";
import { roundTaka } from "./money";
import type { Returned, RunningRange, Spent } from "./returns";
import { returnOf, runningRangeOf } from "./returns";

/**
 * What the dairy herd returns: each dairy Animal her own run over her whole stay, as `CONTEXT.md`'s **Return on Cost**
 * says. One bred here — born to a cow the farm wrote down — from her birth, at nothing; one bought, or here before the
 * farm kept its books, from a price the Owner enters, and named until the Owner has. Charged what she was charged inside
 * her Dairy Holding; paid by her milk to Bulk at what each month's Dispatches fetched, and by what she went for at the
 * end — a Sale, or the price she crossed to Fattening at — or nothing, for one who died. While still here she counts at
 * her kind's **Head Price**, low and high. Every calf is her own run, never her dam's.
 */

/** How a dairy Animal's run began: at her birth here, at a price the Owner entered, or not yet priced. */
export type DairyCame = "born" | "priced" | "unpriced";

/** How a dairy Animal's run ended: an Internal Sale is a Fattening Animal's, never hers. */
export type DairyWent = Exclude<Left["how"], "sold_to_venture">;

/** What a head of one kind would fetch today, low and high. */
export interface HeadRange {
  lowBdt: number;
  highBdt: number;
}

/** One dairy Animal's run, as the Returns page and her own page read it. */
export interface DairyRun {
  animalId: string;
  tagNumber: string;
  state: string;
  damId: string | null;
  came: DairyCame;
  /** When it began: her birth, or the Owner's price's day. Null for one not priced. */
  from: Date | null;
  left: { how: DairyWent; on: Date } | null;
  /** What she has cost: her price and every charge inside her Dairy Holding, to the day she left or today. */
  costBdt: number;
  milkLitres: number;
  milkBdt: number;
  /** What she went for at the end; null while she stands. */
  endBdt: number | null;
  /** The months her milk went at an earlier month's price, for want of a Dispatch in them. */
  milkPricedEarlier: string[];
  /** Once gone and counted: what came back less what she cost, in taka — said even where there is no share to say,
   *  for a calf who cost nothing and fetched nothing. */
  resultBdt: number | null;
  /** Once gone: her result, put a year past the floor. */
  returnOnCost: Returned | null;
  /** While here and counted: her kind's Head Price, what she would fetch today, low and high. */
  worthToday: HeadRange | null;
  /** While here: her milk so far as what she has already brought back, and her Head Price as what she would fetch. */
  running: RunningRange | null;
  /** Why she is in no figure, if she is not. */
  gaps: Gap[];
}

/** One dairy Animal as her run reads her. */
export interface DairyAnimalRead {
  id: string;
  tagNumber: string;
  state: string;
  source: string;
  damId: string | null;
  birthDate: Date | null;
  createdAt: Date;
  /** The price the Owner entered for one bought, or here before the books, and the day it holds from. */
  entryPrice: { priceBdt: number; asOf: string } | null;
}

/** Litres one cow sent to Bulk at one milking. */
export interface LitresSent {
  at: Date;
  side: string;
  litres: number;
}

/** What the dairy runs are read from: the Books every return is, and every cow's litres to Bulk. */
export type DairyBooks = Pick<
  ReturnBooks,
  | "charges"
  | "animals"
  | "ownedThenBy"
  | "joinings"
  | "internal"
  | "died"
  | "lost"
> & { litres: ReadonlyMap<string, readonly LitresSent[]> };

/**
 * Bred here: born to a dam the farm wrote down, so counted from her birth at nothing and never priced. One registered
 * as born with no dam was here before the books began, and is priced as one bought is.
 */
export const bredHere = (her: { source: string; damId: string | null }) =>
  her.source === "born" && her.damId !== null;

/** A month of the farm's, as its first day says it. */
const monthKey = (at: Date) => farmDayOf(at).slice(0, 7);

/**
 * What a litre fetched each month the farm sent milk away: that month's Dispatches, every litre weighed by its price.
 * A month with none has no price of its own.
 */
export const milkPricesByMonth = (
  dispatches: readonly {
    dispatchedAt: Date;
    litres: number;
    pricePerLitreBdt: number;
  }[]
): Map<string, number> => {
  const byMonth = new Map<
    string,
    { litres: number; pricePerLitreBdt: number }[]
  >();
  for (const one of dispatches) {
    const key = monthKey(one.dispatchedAt);
    byMonth.set(key, [...(byMonth.get(key) ?? []), one]);
  }
  const priced = new Map<string, number>();
  for (const [key, given] of byMonth) {
    const price = milkPriceOf(given);
    if (price) {
      priced.set(key, price.bdtPerLitre);
    }
  }
  return priced;
};

/** A month's price, or — for a month with no Dispatch — the latest earlier month's, and whether it was borrowed. */
const priceFor = (
  prices: ReadonlyMap<string, number>,
  month: string
): { bdtPerLitre: number; earlier: boolean } | null => {
  const own = prices.get(month);
  if (own !== undefined) {
    return { bdtPerLitre: own, earlier: false };
  }
  const before = [...prices.keys()]
    .filter((key) => key < month)
    .toSorted()
    .at(-1);
  return before === undefined
    ? null
    : { bdtPerLitre: prices.get(before) ?? 0, earlier: true };
};

/** Her milk to Bulk between two moments, month by month at each month's price. Null where a month has no price at all. */
const milkOf = (
  litres: readonly LitresSent[],
  prices: ReadonlyMap<string, number>,
  from: Date,
  until: Date
) => {
  const byMonth = new Map<string, number>();
  for (const one of litres) {
    if (one.side === "dairy" && one.at >= from && one.at <= until) {
      const key = monthKey(one.at);
      byMonth.set(key, (byMonth.get(key) ?? 0) + one.litres);
    }
  }
  let bdt = 0;
  let total = 0;
  const earlier: string[] = [];
  for (const [month, given] of [...byMonth].toSorted(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const price = priceFor(prices, month);
    if (!price) {
      return null;
    }
    if (price.earlier) {
      earlier.push(month);
    }
    bdt += given * price.bdtPerLitre;
    total += given;
  }
  return { litres: total, bdt, earlier };
};

/** How she came to the herd: bred here from a dam the farm wrote down, or at the Owner's price, or not priced yet. */
const cameOf = (
  her: DairyAnimalRead
): { came: DairyCame; from: Date | null; priceBdt: number } => {
  if (her.entryPrice) {
    return {
      came: "priced",
      from: startOfFarmDay(her.entryPrice.asOf),
      priceBdt: her.entryPrice.priceBdt,
    };
  }
  if (bredHere(her)) {
    return { came: "born", from: her.birthDate ?? her.createdAt, priceBdt: 0 };
  }
  return { came: "unpriced", from: null, priceBdt: 0 };
};

/** Why her run is in no figure: not priced, milk with no price to go at, a crossing not priced, no Head Price. */
const whyUncounted = (
  came: DairyCame,
  milk: ReturnType<typeof milkOf>,
  went: Left | null,
  head: HeadRange | undefined
): Gap["why"][] => [
  ...(came === "unpriced" ? (["no_entry_price"] as const) : []),
  ...(milk ? [] : (["no_milk_price"] as const)),
  ...(went && went.backBdt === null ? (["not_priced"] as const) : []),
  ...(went || head ? [] : (["no_head_price"] as const)),
];

/** What she cost: her price from the day her run began, and every charge inside her Dairy Holding. */
const whatSheCost = (
  books: DairyBooks,
  her: DairyAnimalRead,
  priceBdt: number,
  begun: Date,
  until: Date
): Spent[] => [
  ...(priceBdt > 0 ? [{ bdt: priceBdt, from: begun, until }] : []),
  ...chargesInHolding(
    books.charges.get(her.id) ?? [],
    { animalId: her.id, owner: null, side: "dairy", from: begun, until },
    books.ownedThenBy
  ).map((one) => ({ bdt: one.bdt, from: one.at, until })),
];

/**
 * Her figure: a result once she has gone; while she is here, a range — her milk so far as what she has already
 * brought back, apart from her Head Price as what she would fetch today. None where she is uncounted.
 */
const figuresOf = (
  spent: Spent[],
  milkBdt: number,
  finished: Left | null,
  standing: HeadRange | null,
  floorDays: number
) => ({
  resultBdt: finished
    ? roundTaka(
        milkBdt +
          (finished.backBdt ?? 0) -
          spent.reduce((sum, one) => sum + one.bdt, 0)
      )
    : null,
  returnOnCost: finished
    ? returnOf({
        spent,
        backBdt: milkBdt + (finished.backBdt ?? 0),
        floorDays,
        finished: true,
      })
    : null,
  worthToday: standing,
  running: standing
    ? runningRangeOf({
        sold: { spent: [], backBdt: milkBdt },
        standing: { spent, lowBdt: standing.lowBdt, highBdt: standing.highBdt },
      })
    : null,
});

/** One dairy Animal's run, worked out: her Dairy Holding from the day it began to the day she left it, or today. */
export const dairyRunOf = (
  books: DairyBooks,
  her: DairyAnimalRead,
  milkPrices: ReadonlyMap<string, number>,
  headPrices: ReadonlyMap<string, HeadRange>,
  floorDays: number,
  now: Date
): { run: DairyRun; spent: Spent[] } => {
  const { came, from, priceBdt } = cameOf(her);
  const begun = from ?? her.createdAt;
  const went = howSheLeft(
    { animalId: her.id, owner: null, side: "dairy", from: begun },
    whatHappenedTo(books, her.id),
    books.ownedThenBy
  );
  const until = went?.on ?? now;
  const spent = whatSheCost(books, her, priceBdt, begun, until);
  const milk = milkOf(books.litres.get(her.id) ?? [], milkPrices, begun, until);
  const head = went ? undefined : headPrices.get(her.state);
  const gaps = whyUncounted(came, milk, went, head).map((why) => ({
    tagNumber: her.tagNumber,
    why,
  }));
  const milkBdt = milk?.bdt ?? 0;
  const counted = gaps.length === 0;
  const finished = counted && went ? went : null;
  const standing = counted && head ? head : null;
  return {
    run: {
      animalId: her.id,
      tagNumber: her.tagNumber,
      state: her.state,
      damId: her.damId,
      came,
      from,
      // An Internal Sale is never a dairy Animal's: one could only follow her crossing, which ended this run first.
      left: went
        ? {
            how: went.how === "sold_to_venture" ? "sold" : went.how,
            on: went.on,
          }
        : null,
      costBdt: roundTaka(spent.reduce((sum, one) => sum + one.bdt, 0)),
      milkLitres: roundLitres(milk?.litres ?? 0),
      milkBdt: roundTaka(milkBdt),
      endBdt: went?.backBdt ?? null,
      milkPricedEarlier: milk?.earlier ?? [],
      ...figuresOf(spent, milkBdt, finished, standing, floorDays),
      gaps,
    },
    spent,
  };
};

/**
 * The herd still here, together: what its milk has brought back so far, and every dairy Animal standing at her kind's
 * Head Price, low and high, as what it would fetch today — an estimate, never put a year — with those who cannot be
 * counted left out whole and named. One who has cost nothing yet is still counted at her Head Price.
 */
export const herdNowOf = (
  standing: readonly DairyRun[],
  spentOf: ReadonlyMap<string, Spent[]>
) => {
  const counted = standing.filter((one) => one.worthToday !== null);
  const sum = (of: (run: DairyRun) => number) =>
    counted.reduce((total, one) => total + of(one), 0);
  return {
    head: standing.length,
    milkBdt: roundTaka(sum((run) => run.milkBdt)),
    running:
      counted.length === 0
        ? null
        : runningRangeOf({
            sold: { spent: [], backBdt: sum((run) => run.milkBdt) },
            standing: {
              spent: counted.flatMap((one) => spentOf.get(one.animalId) ?? []),
              lowBdt: sum((run) => run.worthToday?.lowBdt ?? 0),
              highBdt: sum((run) => run.worthToday?.highBdt ?? 0),
            },
          }),
    gaps: standing.flatMap((one) => one.gaps),
  };
};

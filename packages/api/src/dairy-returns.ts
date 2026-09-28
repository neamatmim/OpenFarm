import type { Database } from "@OpenFarm/db";
import type { HeadPriceKind } from "@OpenFarm/db/schema/returns";
import { HEAD_PRICE_KINDS } from "@OpenFarm/db/schema/returns";
import type {
  Gap,
  OwnedThenBy,
  Returned,
  RunningRange,
  Spent,
} from "@OpenFarm/domain";
import {
  chargesInHolding,
  farmDayOf,
  milkPriceOf,
  returnOf,
  roundLitres,
  roundTaka,
  runningRangeOf,
  startOfFarmDay,
} from "@OpenFarm/domain";

import type { FarmCosts } from "./cost-store";

/**
 * What the dairy herd returns: each dairy Animal her own run over her whole stay, as `CONTEXT.md`'s **Return on Cost**
 * says. One bred here — born to a cow the farm wrote down — from her birth, at nothing; one bought, or here before the
 * farm kept its books, from a price the Owner enters, and named until the Owner has. Charged what she was charged while
 * on the Dairy side; paid by her milk to Bulk at what each month's Dispatches fetched, and by what she went for at the
 * end — a Sale, or the price she crossed to Fattening at — or nothing, for one who died. While still here she counts at
 * her kind's **Head Price**, low and high. Every calf is her own run, never her dam's.
 */

/** How a dairy Animal's run began: at her birth here, at a price the Owner entered, or not yet priced. */
type Came = "born" | "priced" | "unpriced";

/** How a dairy Animal's run ended. */
type Went = "sold" | "crossed" | "died";

/** One dairy Animal's run, as the Returns page and her own page read it. */
export interface DairyRun {
  animalId: string;
  tagNumber: string;
  state: string;
  damId: string | null;
  came: Came;
  /** When it began: her birth, or the Owner's price's day. Null for one not priced. */
  from: Date | null;
  left: { how: Went; on: Date } | null;
  /** What she has cost: her price and every Dairy-side share, to the day she left or today. */
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

/** What a head of one kind would fetch today, low and high. */
export interface HeadRange {
  lowBdt: number;
  highBdt: number;
}

/** The Head Prices, one for each kind of dairy Animal. */
type HeadPrices = Map<string, HeadRange>;

/**
 * Bred here: born to a dam the farm wrote down, so counted from her birth at nothing and never priced. One registered
 * as born with no dam was here before the books began, and is priced as one bought is.
 */
export const bredHere = (her: { source: string; damId: string | null }) =>
  her.source === "born" && her.damId !== null;

/** Every Animal who has stood on the Dairy side: there now, or walked across from it to Fattening. */
export const EVER_ON_THE_DAIRY_SIDE = {
  OR: [{ side: "dairy" as const }, { joinings: { how: "crossed" as const } }],
};

/** A month of the farm's, as its first day says it. */
const monthKey = (at: Date) => farmDayOf(at).slice(0, 7);

/**
 * What a litre fetched each month the farm sent milk away: that month's Dispatches, every litre weighed by its price.
 * A month with none has no price of its own.
 */
const monthlyMilkPrices = async (db: Database, farmId: string) => {
  const rows = await db.query.dispatch.findMany({
    where: { farmId },
    columns: { dispatchedAt: true, litres: true, pricePerLitreBdt: true },
  });
  const byMonth = new Map<
    string,
    { litres: number; pricePerLitreBdt: number }[]
  >();
  for (const one of rows) {
    const key = monthKey(one.dispatchedAt);
    const month = byMonth.get(key) ?? [];
    month.push({
      litres: Number(one.litres),
      pricePerLitreBdt: Number(one.pricePerLitreBdt),
    });
    byMonth.set(key, month);
  }
  const priced = new Map<string, number>();
  for (const [key, dispatches] of byMonth) {
    const price = milkPriceOf(dispatches);
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
  litres: readonly { at: Date; side: string; litres: number }[],
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

/** What the dairy runs are read from, beyond the costing: the crossings, the dead, and what the Owner has priced. */
export interface DairyBooks {
  costs: FarmCosts;
  /** Whose an Animal was at a moment. A dairy Animal is always the Farm's own, and her Holding asks it all the same. */
  ownedThenBy: OwnedThenBy;
  joinings: readonly {
    animalId: string;
    joinedAt: Date;
    how: string;
    priceBdt: number | null;
  }[];
  died: ReadonlyMap<string, Date>;
}

/** Every dairy Animal the farm has had, with what her run needs to know of her. */
const dairyAnimalsOf = async (db: Database, farmId: string) =>
  await db.query.animal.findMany({
    where: { farmId, ...EVER_ON_THE_DAIRY_SIDE },
    columns: {
      id: true,
      tagNumber: true,
      state: true,
      source: true,
      damId: true,
      birthDate: true,
      createdAt: true,
    },
    with: {
      entryPrice: { columns: { priceBdt: true, asOf: true } },
    },
    orderBy: { tagNumber: "asc", id: "asc" },
  });

type DairyAnimal = Awaited<ReturnType<typeof dairyAnimalsOf>>[number];

/** How she came to the herd: bred here from a dam the farm wrote down, or at the Owner's price, or not priced yet. */
const cameOf = (
  her: DairyAnimal
): { came: Came; from: Date | null; priceBdt: number } => {
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

/** How her run ended, and what she went for: her crossing to Fattening first, then a Sale, then her death. */
const wentOf = (
  books: DairyBooks,
  her: DairyAnimal
): { how: Went; on: Date; bdt: number | null } | null => {
  const crossing = books.joinings.find(
    (one) => one.animalId === her.id && one.how === "crossed"
  );
  if (crossing) {
    return { how: "crossed", on: crossing.joinedAt, bdt: crossing.priceBdt };
  }
  const sale = books.costs.animals.find((one) => one.id === her.id)?.sale;
  if (sale) {
    return { how: "sold", on: sale.soldAt, bdt: sale.priceBdt };
  }
  const diedAt = books.died.get(her.id);
  return diedAt ? { how: "died", on: diedAt, bdt: 0 } : null;
};

type Ended = ReturnType<typeof wentOf>;
type Milked = ReturnType<typeof milkOf>;

/** Why her run is in no figure: not priced, milk with no price to go at, a crossing not priced, no Head Price. */
const whyUncounted = (
  came: Came,
  milk: Milked,
  went: Ended,
  head: HeadRange | undefined
): Gap["why"][] => [
  ...(came === "unpriced" ? (["no_entry_price"] as const) : []),
  ...(milk ? [] : (["no_milk_price"] as const)),
  ...(went && went.bdt === null ? (["not_priced"] as const) : []),
  ...(went || head ? [] : (["no_head_price"] as const)),
];

/** What she cost: her price from the day her run began, and every charge inside her Dairy Holding. */
const whatSheCost = (
  books: DairyBooks,
  her: DairyAnimal,
  priceBdt: number,
  begun: Date,
  until: Date
): Spent[] => [
  ...(priceBdt > 0 ? [{ bdt: priceBdt, from: begun, until }] : []),
  ...chargesInHolding(
    books.costs.ofAnimal.charges.get(her.id) ?? [],
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
  finished: { bdt: number | null } | null,
  standing: HeadRange | null,
  floorDays: number
) => ({
  resultBdt: finished
    ? roundTaka(
        milkBdt +
          (finished.bdt ?? 0) -
          spent.reduce((sum, one) => sum + one.bdt, 0)
      )
    : null,
  returnOnCost: finished
    ? returnOf({
        spent,
        backBdt: milkBdt + (finished.bdt ?? 0),
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

/** One dairy Animal's run, worked out. */
const runOf = (
  books: DairyBooks,
  her: DairyAnimal,
  milkPrices: ReadonlyMap<string, number>,
  headPrices: HeadPrices,
  floorDays: number,
  now: Date
): { run: DairyRun; spent: Spent[] } => {
  const { came, from, priceBdt } = cameOf(her);
  const went = wentOf(books, her);
  const until = went?.on ?? now;
  const begun = from ?? her.createdAt;
  const spent = whatSheCost(books, her, priceBdt, begun, until);
  const milk = milkOf(
    books.costs.ofAnimal.litres.get(her.id) ?? [],
    milkPrices,
    begun,
    until
  );
  const head = went ? undefined : headPrices.get(her.state);
  const gaps = whyUncounted(came, milk, went, head).map((why) => ({
    tagNumber: her.tagNumber,
    why,
  }));
  const milkBdt = milk?.bdt ?? 0;
  const counted = gaps.length === 0;
  const finished = counted && went ? went : null;
  const standing = counted && head ? head : null;
  const run: DairyRun = {
    animalId: her.id,
    tagNumber: her.tagNumber,
    state: her.state,
    damId: her.damId,
    came,
    from,
    left: went ? { how: went.how, on: went.on } : null,
    costBdt: roundTaka(spent.reduce((sum, one) => sum + one.bdt, 0)),
    milkLitres: roundLitres(milk?.litres ?? 0),
    milkBdt: roundTaka(milkBdt),
    endBdt: went?.bdt ?? null,
    milkPricedEarlier: milk?.earlier ?? [],
    ...figuresOf(spent, milkBdt, finished, standing, floorDays),
    gaps,
  };
  return { run, spent };
};

/** Every dairy Animal's run, the farm's milk prices and Head Prices read once. */
const dairyRunsOf = async (
  db: Database,
  farmId: string,
  books: DairyBooks,
  floorDays: number,
  now: Date
) => {
  const animals = await dairyAnimalsOf(db, farmId);
  const milkPrices = await monthlyMilkPrices(db, farmId);
  const heads = await db.query.headPrice.findMany({
    where: { farmId },
    columns: { kind: true, lowBdt: true, highBdt: true },
  });
  const headPrices: HeadPrices = new Map(
    heads.map((one) => [one.kind, { lowBdt: one.lowBdt, highBdt: one.highBdt }])
  );
  const worked = animals.map((her) =>
    runOf(books, her, milkPrices, headPrices, floorDays, now)
  );
  return {
    animals,
    heads,
    runs: worked.map((one) => one.run),
    spentOf: new Map(worked.map((one) => [one.run.animalId, one.spent])),
  };
};

/**
 * The herd still here, together: what its milk has brought back so far, and every dairy Animal standing at her kind's
 * Head Price, low and high, as what it would fetch today — an estimate, never put a year — with those who cannot be
 * counted left out whole and named. One who has cost nothing yet is still counted at her Head Price.
 */
const herdNowOf = (
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

/** The dairy runs the Returns page shows: the herd now, each gone with her calves, the Head Prices, and whom to price. */
export const dairyOf = async (
  db: Database,
  farmId: string,
  books: DairyBooks,
  floorDays: number,
  now: Date
) => {
  const { runs, heads, animals, spentOf } = await dairyRunsOf(
    db,
    farmId,
    books,
    floorDays,
    now
  );
  const calvesOf = (animalId: string) =>
    runs.filter((one) => one.damId === animalId);
  const standing = runs.filter((one) => one.left === null);
  const written = new Map(animals.map((one) => [one.id, one.createdAt]));
  return {
    herdNow: herdNowOf(standing, spentOf),
    /** Each dairy Animal still here, for the Cull list to set her return so far beside her reasons. */
    standing,
    gone: runs
      .filter((one) => one.left !== null)
      .toSorted(
        (a, b) =>
          (b.left?.on.getTime() ?? 0) - (a.left?.on.getTime() ?? 0) ||
          a.tagNumber.localeCompare(b.tagNumber)
      )
      .map((one) => ({ ...one, calves: calvesOf(one.animalId) })),
    headPrices: HEAD_PRICE_KINDS.map((kind: HeadPriceKind) => {
      const set = heads.find((one) => one.kind === kind);
      return {
        kind,
        lowBdt: set?.lowBdt ?? null,
        highBdt: set?.highBdt ?? null,
      };
    }),
    /** Every dairy Animal the Owner has yet to price: bought, or here before the books, with the day she was written
     *  down on the farm's books, which her price counts from unless the Owner says. */
    toPrice: runs
      .filter((one) => one.came === "unpriced")
      .map((one) => ({
        animalId: one.animalId,
        tagNumber: one.tagNumber,
        state: one.state,
        onTheBooksFrom: farmDayOf(written.get(one.animalId) ?? now),
      })),
  };
};

/** One dairy Animal's run and her calves', for her own page; nothing for one never on the Dairy side. */
export const dairyAnimalOf = async (
  db: Database,
  farmId: string,
  books: DairyBooks,
  animalId: string,
  floorDays: number,
  now: Date
) => {
  const { runs } = await dairyRunsOf(db, farmId, books, floorDays, now);
  const run = runs.find((one) => one.animalId === animalId);
  return run
    ? { run, calves: runs.filter((one) => one.damId === animalId) }
    : null;
};

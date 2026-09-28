import { seasonOf } from "./eid";
import { farmDayOf, startOfFarmDay } from "./farm-clock";
import type { TargetWindow } from "./fattening";
import type { Charge, Left, OwnedThenBy, WhatHappened } from "./holding";
import { chargesInHolding, howSheLeft } from "./holding";
import { roundTaka } from "./money";
import type { Returned, RunningRange, Spent } from "./returns";
import { returnOf, returnOnCapitalOf, runningRangeOf } from "./returns";

/**
 * What the money in the farm's cattle returned, for the Owner: each **Season** of the Farm's own fattening Animals and
 * each **Venture**, worked as a Settlement is — what the Animals fetched, less what they cost to take on and every
 * charge inside each Holding, the dead in (CONTEXT.md, Return on Cost; Holding). Worked from the Books the api reads,
 * never from the database itself, so every rule here is tested with the Books written out by hand.
 */

/**
 * Why an Animal is in no figure: a fattening one with no weight to price or no price a kilo to price her at; a
 * crossing not priced; a dairy one the Owner has not priced, whose kind has no Head Price, or whose milk went in a
 * month before any Dispatch had a price.
 */
export type NotValued =
  | "no_weight"
  | "no_price"
  | "not_priced"
  | "no_entry_price"
  | "no_head_price"
  | "no_milk_price";

/** A standing Animal left out of a figure, whole, and what puts her right. */
export interface Gap {
  tagNumber: string;
  why: NotValued;
}

/** A **Bank Rate** as the Owner typed it. */
export interface BankRate {
  perYear: number;
  note: string;
  fromDay: string;
}

/** A **Bank Rate** as the page says it beside a rate a year. */
export type BankRateSaid = BankRate;

/** The Bank Rate in force on a farm day, from rates the latest first: the latest day on or before it. None before. */
export const rateInForceOn = <Rate extends BankRate>(
  rates: readonly Rate[],
  day: string
): Rate | null => rates.find((one) => one.fromDay <= day) ?? null;

/**
 * The Bank Rate beside a rate a year: the one in force on the day that money first went in, as a deposit made that day
 * would have locked it — and none for money with no rate a year to set it beside.
 */
export const bankRateFor = (
  rates: readonly BankRate[],
  firstTaka: Date | null,
  returned: { perYear: number | null } | null
): BankRateSaid | null => {
  if (returned === null || returned.perYear === null || firstTaka === null) {
    return null;
  }
  const inForce = rateInForceOn(rates, farmDayOf(firstTaka));
  return inForce
    ? { perYear: inForce.perYear, note: inForce.note, fromDay: inForce.fromDay }
    : null;
};

/** The day the first of some money went in: the earliest of the days. None for none. */
export const earliest = (days: readonly Date[]): Date | null =>
  days.length === 0
    ? null
    : new Date(Math.min(...days.map((one) => one.getTime())));

/**
 * How an Animal joins the Farm's Fattening side other than by Intake: crossed from Dairy, or bought from a Venture. The
 * database spells the same two; the api hands its joinings to these Books, so a third there does not compile until it
 * is named here too.
 */
export type JoinedHow = "crossed" | "bought_from_venture";

/**
 * What every sum is read from, read once by the api: each Animal's charges and what happened to her, how each came to
 * an owner, today's values, the Bank Rates, and whose each was on a day.
 */
export interface ReturnBooks {
  /** Every charge to each Animal. */
  charges: ReadonlyMap<string, readonly Charge[]>;
  /** Every Animal's tag, and her Sale if she was sold. */
  animals: readonly {
    id: string;
    tagNumber: string;
    sale: { soldAt: Date; priceBdt: number } | null;
  }[];
  ownedThenBy: OwnedThenBy;
  /** Every Intake: who came, for how much, when, and fed for which Target Window. */
  intakes: readonly {
    id: string;
    animalId: string;
    purchasePriceBdt: number;
    arrivedAt: Date;
    targetWindowStart: string;
    targetWindowEnd: string;
  }[];
  /** Every time an Animal came to the Farm's Fattening side other than by Intake. */
  joinings: readonly {
    id: string;
    animalId: string;
    joinedAt: Date;
    how: JoinedHow;
    targetWindowStart: string;
    targetWindowEnd: string;
    priceBdt: number | null;
    internalSaleId: string | null;
  }[];
  /** Every Internal Sale, in the order they were saved. */
  internal: readonly {
    id: string;
    animalId: string;
    fromVentureId: string | null;
    toVentureId: string | null;
    priceBdt: number;
    createdAt: Date;
    on: Date;
  }[];
  died: ReadonlyMap<string, Date>;
  /** What each standing fattening Animal is worth today, low and high — or why not. */
  values: ReadonlyMap<string, { lowBdt: number; highBdt: number } | Gap>;
  /** Every Bank Rate typed, the one that would be in force first: the latest day, then the latest typed. */
  bankRates: readonly BankRate[];
}

/** What happened to one Animal, as the Books say it. */
export const whatHappenedTo = (
  books: Pick<ReturnBooks, "animals" | "internal" | "died" | "joinings">,
  animalId: string
): WhatHappened => {
  const crossing = books.joinings.find(
    (one) => one.animalId === animalId && one.how === "crossed"
  );
  return {
    sale: books.animals.find((one) => one.id === animalId)?.sale ?? null,
    internalSales: books.internal.filter((one) => one.animalId === animalId),
    crossing: crossing
      ? { on: crossing.joinedAt, priceBdt: crossing.priceBdt }
      : null,
    died: books.died.get(animalId) ?? null,
  };
};

/** One owner's Fattening Holding of one Animal as a return reads it: what she was taken on at and when, and how and
 *  when she left. */
export interface HoldingRead {
  animalId: string;
  takenOn: Date;
  priceBdt: number;
  left: Left | null;
  /** A crossing the Owner has not priced yet: left out of every figure, whole, and named, until she is. */
  unpriced?: { tagNumber: string };
}

/** How one Fattening Holding ended, as the Books say it. */
const leftOf = (
  books: ReturnBooks,
  owner: string | null,
  animalId: string,
  takenOn: Date,
  cameBy?: string | null
): Left | null =>
  howSheLeft(
    { animalId, owner, side: "fattening", from: takenOn, cameBy },
    whatHappenedTo(books, animalId),
    books.ownedThenBy
  );

/**
 * What one Holding put in, each sum out from the day it was spent until she left — or until `today`, for one
 * standing: her price, and every charge inside her Fattening Holding with this owner, counted as a Settlement counts it.
 */
export const spentOn = (
  books: ReturnBooks,
  owner: string | null,
  holding: HoldingRead,
  today: Date
): Spent[] => {
  const until = holding.left?.on ?? today;
  return [
    { bdt: holding.priceBdt, from: holding.takenOn, until },
    ...chargesInHolding(
      books.charges.get(holding.animalId) ?? [],
      {
        animalId: holding.animalId,
        owner,
        side: "fattening",
        from: holding.takenOn,
        until,
      },
      books.ownedThenBy
    ).map((one) => ({ bdt: one.bdt, from: one.at, until })),
  ];
};

/** What some holdings brought back: each one's Sale or Internal Sale out, nothing for the dead, nothing standing. */
export const backOf = (holdings: readonly HoldingRead[]) =>
  holdings.reduce((sum, one) => sum + (one.left?.backBdt ?? 0), 0);

/** What some priced holdings returned: a result once all have gone and none waits on a price, a range until then.
 *  With none at all nothing has finished: there was nothing to go. */
const returnOfPriced = (
  books: ReturnBooks,
  owner: string | null,
  holdings: readonly HoldingRead[],
  today: Date,
  floorDays: number,
  waitingOnAPrice: boolean
) => {
  const finished =
    !waitingOnAPrice &&
    holdings.length > 0 &&
    holdings.every((one) => one.left !== null);
  const spentOf = (one: HoldingRead) => spentOn(books, owner, one, today);
  if (finished) {
    return {
      finished,
      returnOnCost: returnOf({
        spent: holdings.flatMap(spentOf),
        backBdt: backOf(holdings),
        floorDays,
        finished,
      }),
      running: null,
      gaps: [] as Gap[],
    };
  }
  const gone = holdings.filter((one) => one.left !== null);
  const standing = holdings.flatMap((one) => {
    if (one.left !== null) {
      return [];
    }
    // Every standing fattening Animal is priced, or named with why not; one missing from the prices entirely is
    // past the herd the farm reads at once, a thousand head.
    const value = books.values.get(one.animalId);
    return value ? [{ holding: one, value }] : [];
  });
  const valued = standing.flatMap(({ holding, value }) =>
    "why" in value ? [] : [{ holding, value }]
  );
  return {
    finished,
    returnOnCost: null,
    running: runningRangeOf({
      sold: {
        spent: gone.flatMap(spentOf),
        backBdt: backOf(gone),
      },
      standing: {
        spent: valued.flatMap(({ holding }) => spentOf(holding)),
        lowBdt: valued.reduce((sum, { value }) => sum + value.lowBdt, 0),
        highBdt: valued.reduce((sum, { value }) => sum + value.highBdt, 0),
      },
    }),
    gaps: standing.flatMap(({ value }) =>
      "why" in value ? [{ tagNumber: value.tagNumber, why: value.why }] : []
    ),
  };
};

/**
 * What a group of holdings returned: once every Animal has gone, a result — Return on Cost, put a year past the floor;
 * while any stands, a range at today's price — what those gone brought back, and those standing valued as the animal
 * prices value them, low and high — never put a year. A standing Animal who cannot be valued is left out whole, her
 * cost and her value both, and named, so the want of a price never reads as a loss.
 */
export const returnOfHoldings = (
  books: ReturnBooks,
  owner: string | null,
  holdings: readonly HoldingRead[],
  today: Date,
  floorDays: number
) => {
  // A crossing not priced yet is no part of any figure: counted with no price, she would read as bought for nothing.
  const unpriced = holdings.filter((one) => one.unpriced);
  const unpricedGaps: Gap[] = unpriced.map((one) => ({
    tagNumber: one.unpriced?.tagNumber ?? "",
    why: "not_priced",
  }));
  const priced = holdings.filter((one) => !one.unpriced);
  const worked = returnOfPriced(
    books,
    owner,
    priced,
    today,
    floorDays,
    unpriced.length > 0
  );
  return { ...worked, gaps: [...unpricedGaps, ...worked.gaps] };
};

/** How an Animal came to the Farm's Fattening side for a Season: bought in on an Intake, or joined it since. */
export type Came =
  | { how: "intake"; intakeId: string }
  | { how: JoinedHow; joiningId: string };

/** One Animal's holding in a Season, and how she came to it: what the Season's breakdowns sort her by. */
export type SeasonHolding = HoldingRead & { came: Came };

/**
 * The Farm's own fattening Animals grouped into Seasons by the Target Window they were fed for — bought in, walked
 * across from Dairy, or bought from a Venture — each from the day she came, at the price she came at, or named until
 * a crossing is priced. An Animal stays in her Season however she went: sold before her Eid, kept on after it, dead,
 * or sold to a Venture. Read by the page and by a Season's breakdowns, so the two are one sum.
 */
export const seasonGroupsOf = (books: ReturnBooks) => {
  const bySeason = new Map<
    string,
    { season: ReturnType<typeof seasonOf>; holdings: SeasonHolding[] }
  >();
  const add = (window: TargetWindow, holding: SeasonHolding) => {
    const season = seasonOf(window);
    const group = bySeason.get(season.key) ?? { season, holdings: [] };
    group.holdings.push(holding);
    bySeason.set(season.key, group);
  };
  for (const intake of books.intakes) {
    // The Farm's own only: a beast a Venture's money bought is that Venture's, and its Settlement's.
    if (books.ownedThenBy(intake.animalId, intake.arrivedAt) !== null) {
      continue;
    }
    add(
      { start: intake.targetWindowStart, end: intake.targetWindowEnd },
      {
        animalId: intake.animalId,
        takenOn: intake.arrivedAt,
        priceBdt: intake.purchasePriceBdt,
        left: leftOf(books, null, intake.animalId, intake.arrivedAt),
        came: { how: "intake", intakeId: intake.id },
      }
    );
  }
  const tagOf = new Map(books.animals.map((one) => [one.id, one.tagNumber]));
  // A Joining by Internal Sale is stamped when the sale was saved; she was the Farm's from the start of its day.
  const saleDay = new Map(books.internal.map((one) => [one.id, one.on]));
  for (const joining of books.joinings) {
    if (books.ownedThenBy(joining.animalId, joining.joinedAt) !== null) {
      continue;
    }
    const takenOn =
      (joining.internalSaleId && saleDay.get(joining.internalSaleId)) ||
      joining.joinedAt;
    add(
      { start: joining.targetWindowStart, end: joining.targetWindowEnd },
      {
        animalId: joining.animalId,
        takenOn,
        priceBdt: joining.priceBdt ?? 0,
        left: leftOf(
          books,
          null,
          joining.animalId,
          takenOn,
          joining.internalSaleId
        ),
        ...(joining.priceBdt === null
          ? { unpriced: { tagNumber: tagOf.get(joining.animalId) ?? "" } }
          : {}),
        came: { how: joining.how, joiningId: joining.id },
      }
    );
  }
  return bySeason;
};

/** A **Season** as the Owner reads it on the Returns page. */
export interface SeasonReturn {
  key: string;
  eid: string | null;
  window: TargetWindow;
  /** Whether every Animal in it has gone. Only then is it a result, and only then put a year. */
  finished: boolean;
  head: number;
  died: number;
  /** Once finished: what every hundred taka made. Null while an Animal stands. */
  returnOnCost: Returned | null;
  /** While going: the same at today's price, low and high. Null once finished, or with nothing it could value. */
  running: RunningRange | null;
  /** Standing Animals left out of `running`, and why. */
  gaps: Gap[];
  /** The Bank Rate in force on its first taka, beside its rate a year; none without one. */
  bankRate: BankRateSaid | null;
}

/** The Farm's own fattening Animals, Season by Season: what each cost, what came back, and so every hundred taka. */
export const seasonsOf = (
  books: ReturnBooks,
  floorDays: number,
  today: Date
): SeasonReturn[] =>
  [...seasonGroupsOf(books).values()]
    .map(({ season, holdings }) => {
      const worked = returnOfHoldings(books, null, holdings, today, floorDays);
      return {
        key: season.key,
        eid: season.eid,
        window: season.window,
        head: holdings.length,
        died: holdings.filter((one) => one.left?.how === "died").length,
        ...worked,
        bankRate: bankRateFor(
          books.bankRates,
          earliest(holdings.map((one) => one.takenOn)),
          worked.returnOnCost
        ),
      };
    })
    .toSorted(
      (a, b) =>
        b.window.start.localeCompare(a.window.start) ||
        a.key.localeCompare(b.key)
    );

/** One Venture Movement as a Return on Capital reads it. */
export interface CapitalMovement {
  id: string;
  kind: string;
  agreementId: string | null;
  amountBdt: number;
  movedOn: string;
}

/**
 * The Investors' capital as a Return on Capital counts it: each sum that reached the Venture Account on an Agreement,
 * from the day it arrived to the day that Agreement's payout went — for every Agreement a Settlement's shares name
 * that has been paid. The Owner's reading of a whole Venture and an Investor's of their own Agreement, one rule. The
 * Owner's Advance is no capital: only `capital_in` is counted.
 */
export const capitalOf = (
  shares: readonly { agreementId: string; paidMovementId: string | null }[],
  movements: readonly CapitalMovement[]
) => {
  const paidBackOn = new Map(
    movements
      .filter((one) => one.kind === "payout")
      .map((one) => [one.id, startOfFarmDay(one.movedOn)])
  );
  return shares.flatMap((share) => {
    const paidBack = share.paidMovementId
      ? paidBackOn.get(share.paidMovementId)
      : undefined;
    if (!paidBack) {
      return [];
    }
    return movements
      .filter(
        (one) =>
          one.kind === "capital_in" && one.agreementId === share.agreementId
      )
      .map((one) => ({
        bdt: one.amountBdt,
        arrived: startOfFarmDay(one.movedOn),
        paidBack,
      }));
  });
};

/** A **Venture** as the Owner reads it on the Returns page: settled, or still buying, fattening or selling. */
export interface VentureReturn {
  id: string;
  name: string;
  window: TargetWindow;
  settled: boolean;
  /** Whether its last animal has gone and none waits on a price: then a result, settled or not — until then a range. */
  finished: boolean;
  head: number;
  died: number;
  /** Once its last animal has gone — settled or its Settlement still to come: on its cattle, worked from the same
   *  lines its Settlement adds up, put a year over its days. */
  returnOnCost: Returned | null;
  /** Once settled, where a cost or a Correction came after it: how far its cattle's result now stands from the profit
   *  its Settlement was approved on — less below nothing. Null where the two still agree. */
  sinceSettlementBdt: number | null;
  /** While going: the same at today's price, its standing animals at its plan's prices, low and high. */
  running: RunningRange | null;
  /** Standing animals left out of `running`, and why. */
  gaps: Gap[];
  /** Once settled: on the Investors' capital, after the Farm's share, each taka from arrival to payout. Never before. */
  returnOnCapital: ReturnType<typeof returnOnCapitalOf>;
  /** Once settled: the Farm's share, for its work — taka, never a ratio, because the Farm put in no money. */
  farmsShareBdt: number | null;
  /** The Bank Rate in force on the day its first taka went on cattle, beside its Return on Cost a year. */
  bankRate: BankRateSaid | null;
  /** The Bank Rate in force on the day the Investors' first capital reached the Venture Account — earlier than the
   *  first beast, as a deposit made with that money would have been — beside their Return on Capital a year. */
  capitalBankRate: BankRateSaid | null;
}

/** A settled Venture's approved Settlement as its return reads it: what it made, the Farm's share, and whom it paid. */
export interface ApprovedSettlement {
  profitBdt: number;
  farmBdt: number;
  shares: readonly {
    agreementId: string;
    paidMovementId: string | null;
    shareBdt: number;
  }[];
  movements: readonly CapitalMovement[];
}

/**
 * One Venture's cattle read exactly as a Season is — what they fetched, less what they cost to take on and every charge
 * inside its Holding of each — and, once settled, the Investors' capital from the day it arrived to the day it was paid
 * back. One whose last animal has gone has its result before its Settlement is paid out: the same figure the
 * Settlement makes. Only the Investors' capital waits for the payouts.
 */
export const ventureReturnOf = (
  books: ReturnBooks,
  venture: { id: string; name: string; window: TargetWindow },
  settlement: ApprovedSettlement | null,
  floorDays: number,
  today: Date
): VentureReturn => {
  const holdings: HoldingRead[] = [
    ...books.intakes
      .filter(
        (one) => books.ownedThenBy(one.animalId, one.arrivedAt) === venture.id
      )
      .map((one) => ({
        animalId: one.animalId,
        takenOn: one.arrivedAt,
        priceBdt: one.purchasePriceBdt,
        cameBy: null,
      })),
    ...books.internal
      .filter((one) => one.toVentureId === venture.id)
      .map((one) => ({
        animalId: one.animalId,
        takenOn: one.on,
        priceBdt: one.priceBdt,
        cameBy: one.id,
      })),
  ].map(({ cameBy, ...one }) => ({
    ...one,
    left: leftOf(books, venture.id, one.animalId, one.takenOn, cameBy),
  }));
  const worked = returnOfHoldings(
    books,
    venture.id,
    holdings,
    today,
    floorDays
  );
  const bankRate = bankRateFor(
    books.bankRates,
    earliest(holdings.map((one) => one.takenOn)),
    worked.returnOnCost
  );
  const common = {
    id: venture.id,
    name: venture.name,
    window: venture.window,
    head: holdings.length,
    died: holdings.filter((one) => one.left?.how === "died").length,
    finished: worked.finished,
    returnOnCost: worked.returnOnCost,
    running: worked.running,
    gaps: worked.gaps,
    bankRate,
  };
  if (settlement === null) {
    return {
      ...common,
      settled: false,
      sinceSettlementBdt: null,
      returnOnCapital: null,
      farmsShareBdt: null,
      capitalBankRate: null,
    };
  }
  const capital = capitalOf(settlement.shares, settlement.movements);
  const returnOnCapital = returnOnCapitalOf({
    capital,
    shareBdt: settlement.shares.reduce((sum, one) => sum + one.shareBdt, 0),
    floorDays,
  });
  const since =
    worked.returnOnCost === null
      ? 0
      : roundTaka(worked.returnOnCost.resultBdt - settlement.profitBdt);
  return {
    ...common,
    settled: true,
    // Under a taka is the rounding the two sums round at, not news.
    sinceSettlementBdt: Math.abs(since) < 1 ? null : since,
    returnOnCapital,
    farmsShareBdt: settlement.farmBdt,
    capitalBankRate: bankRateFor(
      books.bankRates,
      earliest(capital.map((one) => one.arrived)),
      returnOnCapital
    ),
  };
};

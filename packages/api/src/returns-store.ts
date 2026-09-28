import type { Database } from "@OpenFarm/db";
import type { JoiningHow } from "@OpenFarm/db/schema/fattening";
import type {
  Returned,
  RunningRange,
  Spent,
  TargetWindow,
  WeightBand,
} from "@OpenFarm/domain";
import {
  EXIT_STATES,
  RUNNING_STATES,
  bandStanding,
  chargesInHolding,
  farmDayOf,
  returnOf,
  returnOnCapitalOf,
  runningRangeOf,
  seasonOf,
  startOfFarmDay,
  wholeDaysFrom,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { pricesOnTheSide } from "./animal-price-store";
import { hasBand } from "./band-store";
import type { FarmCosts } from "./cost-store";
import { farmCosts } from "./cost-store";
import { dairyAnimalOf, dairyOf } from "./dairy-returns";
import { bandOf } from "./feed-store";
import { weighedForTheCrossing } from "./joining-store";
import { approvedSettlementOf } from "./settlement-store";
import { ownedThenByOf } from "./venture-store";

/**
 * What the money in the farm's cattle returned, for the Owner's Returns page: each **Season** of the Farm's own
 * fattening Animals and each **Venture**, worked as a Settlement is — what the Animals fetched, less what they cost to
 * take on and everything charged to them while they were its own, the dead in.
 *
 * Never a second sum: the same costing every other reader uses, narrowed to whose each Animal was on the day and to
 * the side she stood on.
 */

/** Whose an Animal was on a day: a Venture's id, or null for the Farm's own. */
type OwnedThenBy = (animalId: string, at: Date) => string | null;

/** How an Animal left an owner, or that she has not. */
type Gone = "sold" | "sold_to_venture" | "died";

/** One owner's holding of one Animal: what she was taken on at and when, and how and when she left it. */
interface Holding {
  animalId: string;
  takenOn: Date;
  priceBdt: number;
  left: { how: Gone; on: Date; backBdt: number } | null;
  /** A crossing the Owner has not priced yet: left out of every figure, whole, and named, until she is. */
  unpriced?: { tagNumber: string };
}

/** A **Bank Rate** as the page says it beside a rate a year. */
export interface BankRateSaid {
  perYear: number;
  note: string;
  fromDay: string;
}

/** Every Bank Rate the Owner has typed, the one that would be in force first: the latest day, then the latest typed. */
const bankRatesOf = async (db: Database, farmId: string) => {
  const rows = await db.query.bankRate.findMany({
    where: { farmId },
    orderBy: { fromDay: "desc", recordedAt: "desc", id: "desc" },
  });
  return rows.map((one) => ({
    id: one.id,
    perYear: Number(one.perYear),
    note: one.note,
    fromDay: one.fromDay,
    recordedAt: one.recordedAt,
  }));
};

type BankRateRows = Awaited<ReturnType<typeof bankRatesOf>>;

/** The Bank Rate in force on a farm day: the latest day on or before it, then the latest typed. None before the first. */
const rateInForceOn = (rates: BankRateRows, day: string) =>
  rates.find((one) => one.fromDay <= day) ?? null;

/**
 * The Bank Rate beside a rate a year: the one in force on the day that money first went in, as a deposit made that day
 * would have locked it — and none for money with no rate a year to set it beside.
 */
const bankRateFor = (
  rates: BankRateRows,
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
const earliest = (days: readonly Date[]): Date | null =>
  days.length === 0
    ? null
    : new Date(Math.min(...days.map((one) => one.getTime())));

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

/** What every sum on the page is read from, read once: the costing, whose each Animal was on a day, and every way an
 *  Animal came to an owner and left one. */
interface Books {
  costs: FarmCosts;
  /** Every time an Animal came to the Farm's Fattening side other than by Intake. */
  joinings: {
    id: string;
    animalId: string;
    joinedAt: Date;
    how: JoiningHow;
    targetWindowStart: string;
    targetWindowEnd: string;
    priceBdt: number | null;
    internalSaleId: string | null;
  }[];
  /** What each standing fattening Animal is worth today, low and high, as the animal prices value her — or why not. */
  values: Map<string, { lowBdt: number; highBdt: number } | Gap>;
  /** Every Bank Rate typed, the one that would be in force first: the latest day, then the latest typed. */
  bankRates: BankRateRows;
  ownedThenBy: OwnedThenBy;
  intakes: {
    id: string;
    animalId: string;
    purchasePriceBdt: number;
    arrivedAt: Date;
    targetWindowStart: string;
    targetWindowEnd: string;
  }[];
  died: Map<string, Date>;
  internal: {
    id: string;
    animalId: string;
    fromVentureId: string | null;
    toVentureId: string | null;
    priceBdt: number;
    /** When it was saved: which of two sales came first, never when she changed hands. */
    createdAt: Date;
    /** When she changed hands: the start of the day written on the sale, for every sum that asks whose she was. */
    on: Date;
  }[];
}

/** What the Returns page needs to know of the farm: its floor, and what the animal prices read. */
type ReturnsFarm = Parameters<typeof pricesOnTheSide>[1] & {
  returnYearFloorDays: number;
};

const booksOf = async (
  db: Database,
  farm: ReturnsFarm,
  now: Date
): Promise<Books> => {
  const farmId = farm.id;
  // One client may be a transaction's, so these reads stay one after another.
  const costs = await farmCosts(db, farmId);
  const ownedThenBy = await ownedThenByOf(db, farmId);
  const intakes = await db.query.intake.findMany({
    where: { farmId },
    columns: {
      id: true,
      animalId: true,
      purchasePriceBdt: true,
      arrivedAt: true,
      targetWindowStart: true,
      targetWindowEnd: true,
    },
  });
  const joinings = await db.query.fatteningJoining.findMany({
    where: { farmId },
    columns: {
      id: true,
      animalId: true,
      joinedAt: true,
      how: true,
      targetWindowStart: true,
      targetWindowEnd: true,
      priceBdt: true,
      internalSaleId: true,
    },
    orderBy: { joinedAt: "asc", id: "asc" },
  });
  const deaths = await db.query.mortality.findMany({
    where: { farmId },
    columns: { animalId: true, happenedAt: true },
  });
  const bankRates = await bankRatesOf(db, farmId);
  const internal = await db.query.internalSale.findMany({
    where: { farmId },
    columns: {
      id: true,
      animalId: true,
      fromVentureId: true,
      toVentureId: true,
      priceBdt: true,
      createdAt: true,
      soldOn: true,
    },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  // What each standing Animal is worth today, exactly as the animal prices say it: never a third valuation.
  const priced = await pricesOnTheSide(db, farm, now);
  const values: Books["values"] = new Map();
  for (const one of priced.animals) {
    if (one.low && one.high) {
      values.set(one.id, {
        lowBdt: one.low.priceBdt,
        highBdt: one.high.priceBdt,
      });
    } else {
      values.set(one.id, {
        tagNumber: one.tagNumber,
        why: one.latestKg === null ? "no_weight" : "no_price",
      });
    }
  }
  return {
    costs,
    joinings,
    values,
    bankRates,
    ownedThenBy,
    intakes,
    died: new Map(deaths.map((one) => [one.animalId, one.happenedAt])),
    internal: internal.map(({ soldOn, ...one }) => ({
      ...one,
      on: startOfFarmDay(soldOn),
    })),
  };
};

/**
 * How and when an Animal taken on by `owner` on `takenOn` left it: the first Internal Sale out of it after she came,
 * her Sale if she was still this owner's when she went, or her death. Null while she stands.
 */
const leftOf = (
  books: Books,
  owner: string | null,
  animalId: string,
  takenOn: Date,
  /** The Internal Sale that brought her to this owner, if one did: only a later one takes her away again, however
   *  close in time — the Farm selling her to a Venture and buying her back in one sitting is two holdings, not one. */
  cameBy?: string | null
): Holding["left"] => {
  const cameAt = cameBy
    ? books.internal.findIndex((one) => one.id === cameBy)
    : -1;
  const soldOn = books.internal.find(
    (one, index) =>
      one.animalId === animalId &&
      one.fromVentureId === owner &&
      (cameBy ? index > cameAt : one.createdAt >= takenOn)
  );
  if (soldOn) {
    return {
      how: "sold_to_venture",
      // The start of the day she was sold on, when she became the buyer's — though never before this owner took
      // her on, for one bought and sold on in the same day.
      on: soldOn.on > takenOn ? soldOn.on : takenOn,
      backBdt: soldOn.priceBdt,
    };
  }
  const sale = books.costs.animals.find((one) => one.id === animalId)?.sale;
  if (sale && books.ownedThenBy(animalId, sale.soldAt) === owner) {
    return { how: "sold", on: sale.soldAt, backBdt: sale.priceBdt };
  }
  const diedAt = books.died.get(animalId);
  return diedAt ? { how: "died", on: diedAt, backBdt: 0 } : null;
};

/**
 * What one holding put in, each sum out from the day it was spent until she left — or until `today`, for one standing:
 * her price, and every charge inside her Fattening Holding with this owner, counted as a Settlement counts it.
 */
const spentOn = (
  books: Books,
  owner: string | null,
  holding: Holding,
  today: Date
): Spent[] => {
  const until = holding.left?.on ?? today;
  return [
    { bdt: holding.priceBdt, from: holding.takenOn, until },
    ...chargesInHolding(
      books.costs.ofAnimal.charges.get(holding.animalId) ?? [],
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
const backOf = (holdings: readonly Holding[]) =>
  holdings.reduce((sum, one) => sum + (one.left?.backBdt ?? 0), 0);

/** The gaps the prices could not fill, added to the ones a valuation could not. */
const withGaps = <T extends { gaps: Gap[] }>(worked: T, more: Gap[]): T => ({
  ...worked,
  gaps: [...more, ...worked.gaps],
});

/** What some priced holdings returned: a result once all have gone and none waits on a price, a range until then. */
const returnOfPriced = (
  books: Books,
  owner: string | null,
  holdings: readonly Holding[],
  today: Date,
  floorDays: number,
  waitingOnAPrice: boolean
) => {
  const finished =
    !waitingOnAPrice && holdings.every((one) => one.left !== null);
  const spentOf = (one: Holding) => spentOn(books, owner, one, today);
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
const returnOfHoldings = (
  books: Books,
  owner: string | null,
  holdings: readonly Holding[],
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
  return withGaps(
    returnOfPriced(books, owner, priced, today, floorDays, unpriced.length > 0),
    unpricedGaps
  );
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

/** How an Animal came to the Farm's Fattening side for a Season: bought in on an Intake, or joined it since. */
type Came =
  | { how: "intake"; intakeId: string }
  | { how: JoiningHow; joiningId: string };

/** One Animal's holding in a Season, and how she came to it: what the Season's breakdowns sort her by. */
type SeasonHolding = Holding & { came: Came };

/**
 * The Farm's own fattening Animals grouped into Seasons by the Target Window they were fed for — bought in, walked
 * across from Dairy, or bought from a Venture — each from the day she came, at the price she came at, or named until
 * a crossing is priced. An Animal stays in her Season however she went: sold before her Eid, kept on after it, dead,
 * or sold to a Venture. Read by the page and by a Season's breakdowns, so the two are one sum.
 */
const seasonGroupsOf = (books: Books) => {
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
  const tagOf = new Map(
    books.costs.animals.map((one) => [one.id, one.tagNumber])
  );
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

/** The Farm's own fattening Animals, Season by Season: what each cost, what came back, and so every hundred taka. */
const seasonsOf = (
  books: Books,
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

/** A **Venture** as the Owner reads it on the Returns page: settled, or still buying, fattening or selling. */
export interface VentureReturn {
  id: string;
  name: string;
  window: TargetWindow;
  settled: boolean;
  head: number;
  died: number;
  /** Once its last animal has gone — settled or its Settlement still to come: on its cattle, worked from the same
   *  lines its Settlement adds up, put a year over its days. */
  returnOnCost: Returned | null;
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

/** One Venture Movement as a Return on Capital reads it. */
interface CapitalMovement {
  id: string;
  kind: string;
  agreementId: string | null;
  amountBdt: number;
  movedOn: string;
}

/**
 * The Investors' capital as a Return on Capital counts it: each sum that reached the Venture Account on an Agreement,
 * from the day it arrived to the day that Agreement's payout went — for every Agreement a Settlement's shares name
 * that has been paid. The Owner's reading of a whole Venture and an Investor's of their own Agreement, one rule.
 */
const capitalOf = (
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

/** The states a Venture has cattle in, or had: the running ones, or settled. */
const WITH_CATTLE = [...RUNNING_STATES, "settled"] as const;

/**
 * Each Venture with cattle: its cattle read exactly as a Season is — what they fetched, less what they cost to take on
 * and everything charged to them while they were its own — and, once settled, the Investors' capital from the day it
 * arrived to the day it was paid back. One still going reads at today's price.
 */
const venturesOf = async (
  db: Database,
  farmId: string,
  books: Books,
  floorDays: number,
  today: Date
): Promise<VentureReturn[]> => {
  const ventures = await db.query.venture.findMany({
    where: { farmId, state: { in: [...WITH_CATTLE] } },
    columns: {
      id: true,
      name: true,
      state: true,
      targetWindowStart: true,
      targetWindowEnd: true,
    },
    orderBy: { targetWindowStart: "desc", id: "asc" },
  });
  const settledIds = ventures
    .filter((one) => one.state === "settled")
    .map((one) => one.id);
  const movements =
    settledIds.length === 0
      ? []
      : await db.query.ventureMovement.findMany({
          where: { farmId, ventureId: { in: settledIds } },
          columns: {
            id: true,
            ventureId: true,
            kind: true,
            agreementId: true,
            amountBdt: true,
            movedOn: true,
          },
        });
  const out: VentureReturn[] = [];
  for (const venture of ventures) {
    const holdings: Holding[] = [
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
    const common = {
      id: venture.id,
      name: venture.name,
      window: {
        start: venture.targetWindowStart,
        end: venture.targetWindowEnd,
      },
      head: holdings.length,
      died: holdings.filter((one) => one.left?.how === "died").length,
      running: worked.running,
      gaps: worked.gaps,
    };
    if (venture.state !== "settled") {
      // Its last animal gone and none waiting on a price, its cattle have a result before its Settlement is paid
      // out: the same figure the Settlement will make. Only the Investors' capital waits for the payouts.
      out.push({
        ...common,
        settled: false,
        returnOnCost: worked.returnOnCost,
        returnOnCapital: null,
        farmsShareBdt: null,
        bankRate: bankRateFor(
          books.bankRates,
          earliest(holdings.map((one) => one.takenOn)),
          worked.returnOnCost
        ),
        capitalBankRate: null,
      });
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one Venture's Settlement at a time, on one client
    const approved = await approvedSettlementOf(db, farmId, venture.id);
    if (!approved) {
      continue;
    }
    const capital = capitalOf(
      approved.shares,
      movements.filter((one) => one.ventureId === venture.id)
    );
    const returnOnCapital = returnOnCapitalOf({
      capital,
      shareBdt: approved.shares.reduce((sum, one) => sum + one.shareBdt, 0),
      floorDays,
    });
    out.push({
      ...common,
      settled: true,
      returnOnCost: worked.returnOnCost,
      returnOnCapital,
      farmsShareBdt: approved.row.farmBdt,
      bankRate: bankRateFor(
        books.bankRates,
        earliest(holdings.map((one) => one.takenOn)),
        worked.returnOnCost
      ),
      capitalBankRate: bankRateFor(
        books.bankRates,
        earliest(capital.map((one) => one.arrived)),
        returnOnCapital
      ),
    });
  }
  return out;
};

/**
 * The crossings the Owner prices: every one still waiting on a price, and those priced whose animal is still on the
 * Farm, so a price may be put right by pricing her again — oldest first, each with what she weighed by the day she
 * crossed (the reading a price is struck from, or nothing, which the price refuses until somebody weighs her) and
 * the price she came in at, if any.
 */
const crossingsOf = async (db: Database, farmId: string) => {
  const rows = await db.query.fatteningJoining.findMany({
    where: {
      farmId,
      how: "crossed",
      OR: [
        { priceBdt: { isNull: true } },
        { animal: { state: { notIn: [...EXIT_STATES] } } },
      ],
    },
    columns: {
      id: true,
      animalId: true,
      joinedOn: true,
      priceBdt: true,
      rateBdtPerKg: true,
    },
    with: { animal: { columns: { tagNumber: true } } },
    orderBy: { joinedAt: "asc", id: "asc" },
  });
  const out = [];
  for (const row of rows) {
    // oxlint-disable-next-line no-await-in-loop -- one client, one crossing at a time
    const weighed = await weighedForTheCrossing(db, row.animalId, row.joinedOn);
    out.push({
      id: row.id,
      tagNumber: row.animal?.tagNumber ?? "",
      joinedOn: row.joinedOn,
      weightKg: weighed?.weightKg ?? null,
      priceBdt: row.priceBdt,
      rateBdtPerKg: row.rateBdtPerKg === null ? null : Number(row.rateBdtPerKg),
    });
  }
  return out;
};

/** Everything the Owner's Returns page reads, worked once. */
export const returnsPage = async (
  db: Database,
  farm: ReturnsFarm,
  now: Date
) => {
  const books = await booksOf(db, farm, now);
  const floorDays = farm.returnYearFloorDays;
  const ventures = await venturesOf(db, farm.id, books, floorDays, now);
  return {
    floorDays,
    seasons: seasonsOf(books, floorDays, now),
    ventures,
    dairy: await dairyOf(db, farm.id, books, floorDays, now),
    bankRates: books.bankRates,
    crossings: await crossingsOf(db, farm.id),
    /** The one in force today, which the page marks: found by the rule every other reading uses, not a second one. */
    bankRateInForceId:
      rateInForceOn(books.bankRates, farmDayOf(now))?.id ?? null,
  };
};

/** The Seasons still going, for the strip above the Fattening board: the same sums as the page, no second one. */
export const runningSeasons = async (
  db: Database,
  farm: ReturnsFarm,
  now: Date
) => {
  const books = await booksOf(db, farm, now);
  return seasonsOf(books, farm.returnYearFloorDays, now).filter(
    (one) => !one.finished
  );
};

/** One Venture's returns, for the panel on its own page; nothing for one with no cattle yet. */
export const ventureReturns = async (
  db: Database,
  farm: ReturnsFarm,
  ventureId: string,
  now: Date
) => {
  const books = await booksOf(db, farm, now);
  const ventures = await venturesOf(
    db,
    farm.id,
    books,
    farm.returnYearFloorDays,
    now
  );
  const venture = ventures.find((one) => one.id === ventureId);
  return venture ? { ...venture, floorDays: farm.returnYearFloorDays } : null;
};

/** The ways a finished Season opens out. */
export const BREAKDOWNS = [
  "haat",
  "trader",
  "breed",
  "band",
  "animal",
] as const;
export type BreakdownBy = (typeof BREAKDOWNS)[number];

/**
 * What one line of a breakdown is: a haat, a trader or a breed by its name; a Weight Band by its weights; one with none
 * of it written — the farm gate, no seller, no breed, no band her weight fell in; one who joined the Season other than
 * by Intake, who had no haat or trader; or one Animal, how she came and how she left.
 */
export type BreakdownLine =
  | { kind: "named"; id: string; name: string; nameEn: string | null }
  | { kind: "band"; fromKg: number | null; toKg: number | null }
  | { kind: "none" }
  | { kind: JoiningHow }
  | {
      kind: "animal";
      tagNumber: string;
      came: "intake" | JoiningHow;
      /** The farm day she came to the Season: an Animal sold to a Venture and bought back is two lines. */
      since: string;
      left: Gone;
    };

/** One line of a breakdown: its Animals' own share of the Season's sum. A share only, never put a year. */
export interface BreakdownRow {
  line: BreakdownLine;
  head: number;
  died: number;
  costBdt: number;
  backBdt: number;
  resultBdt: number;
  /** What every hundred taka made, to one place; null for a line that cost nothing. */
  per100: number | null;
}

/** A band's From, an open one below every weight: what bands are ordered by. */
const fromOf = (band: WeightBand) => band.fromKg ?? -Infinity;

/** A band's To, an open one above every weight. */
const toOf = (band: WeightBand) => band.toKg ?? Infinity;

/** The narrower band first: the higher From, then the lower To. */
const narrowerFirst = (a: WeightBand, b: WeightBand) =>
  fromOf(b) - fromOf(a) || toOf(a) - toOf(b);

/**
 * Every Weight Band the Farm's Rations have been written for, retired ones too — a finished Season's buying weights do
 * not move because a Ration was put away since — each once however many Rations share it.
 */
const farmsBands = (
  rations: readonly { weightFromKg: string | null; weightToKg: string | null }[]
): WeightBand[] => {
  const seen = new Map<string, WeightBand>();
  for (const band of rations.map(bandOf).filter(hasBand)) {
    seen.set(`${band.fromKg}|${band.toKg}`, band);
  }
  return [...seen.values()];
};

/** The band a weight fell in: of those it fits, the narrowest, so a Ration for "up to 400 kg" does not swallow one
 *  written for 150 to 250. None where it fits none. */
const bandOfWeight = (
  bands: readonly WeightBand[],
  kg: number
): WeightBand | undefined =>
  bands
    .filter((one) => bandStanding(kg, one) === "fits")
    .toSorted(narrowerFirst)[0];

/** What the breakdowns need to know of each Animal in a Season beyond her money: where, from whom, what, how heavy. */
const buyingFactsOf = async (
  db: Database,
  farmId: string,
  holdings: readonly SeasonHolding[]
) => {
  const intakeIds = holdings.flatMap(({ came }) =>
    came.how === "intake" ? [came.intakeId] : []
  );
  const joiningIds = holdings.flatMap(({ came }) =>
    "joiningId" in came ? [came.joiningId] : []
  );
  // One client may be a transaction's, so these reads stay one after another.
  const intakes = await db.query.intake.findMany({
    where: { farmId, id: { in: intakeIds } },
    columns: { id: true, weightKg: true },
    with: {
      seller: { columns: { id: true, name: true } },
      buyingTrip: { columns: { wentTo: true } },
    },
  });
  const joinings = await db.query.fatteningJoining.findMany({
    where: { farmId, id: { in: joiningIds } },
    columns: { id: true, weightKg: true },
  });
  const animals = await db.query.animal.findMany({
    where: { farmId, id: { in: holdings.map((one) => one.animalId) } },
    columns: { id: true, tagNumber: true },
    with: { breed: { columns: { id: true, nameBn: true, nameEn: true } } },
  });
  const rations = await db.query.ration.findMany({
    where: { farmId },
    columns: { weightFromKg: true, weightToKg: true },
  });
  return {
    intakes: new Map(intakes.map((one) => [one.id, one])),
    joinedKg: new Map(
      joinings.map((one) => [
        one.id,
        one.weightKg === null ? null : Number(one.weightKg),
      ])
    ),
    animals: new Map(animals.map((one) => [one.id, one])),
    bands: farmsBands(rations),
  };
};

type BuyingFacts = Awaited<ReturnType<typeof buyingFactsOf>>;

const NONE: BreakdownLine = { kind: "none" };

type BoughtOn = BuyingFacts["intakes"] extends Map<string, infer I> ? I : never;

/** The Weight Band her weight fell in when she came — the Intake's weight, or the joining's — or none. */
const bandLineOf = (
  came: Came,
  intake: BoughtOn | undefined,
  facts: BuyingFacts
): BreakdownLine => {
  const kg =
    "joiningId" in came
      ? facts.joinedKg.get(came.joiningId)
      : Number(intake?.weightKg);
  if (kg === null || kg === undefined || Number.isNaN(kg)) {
    return NONE;
  }
  const band = bandOfWeight(facts.bands, kg);
  return band ? { kind: "band", ...band } : NONE;
};

/** Where she was bought, or from whom: an Intake's haat, from her Buying Trip, or her seller. */
const boughtLineOf = (
  by: "haat" | "trader",
  intake: BoughtOn | undefined
): BreakdownLine => {
  if (by === "haat") {
    const wentTo = intake?.buyingTrip?.wentTo.trim();
    return wentTo
      ? { kind: "named", id: wentTo, name: wentTo, nameEn: null }
      : NONE;
  }
  return intake?.seller
    ? {
        kind: "named",
        id: intake.seller.id,
        name: intake.seller.name,
        nameEn: null,
      }
    : NONE;
};

/** Which line of a breakdown one holding falls in. */
const lineOf = (
  by: BreakdownBy,
  holding: SeasonHolding,
  facts: BuyingFacts
): BreakdownLine => {
  const { came } = holding;
  const her = facts.animals.get(holding.animalId);
  const intake =
    came.how === "intake" ? facts.intakes.get(came.intakeId) : undefined;
  if (by === "animal") {
    return {
      kind: "animal",
      tagNumber: her?.tagNumber ?? "",
      came: came.how,
      since: farmDayOf(holding.takenOn),
      left: holding.left?.how ?? "sold",
    };
  }
  if (by === "breed") {
    return her?.breed
      ? {
          kind: "named",
          id: her.breed.id,
          name: her.breed.nameBn,
          nameEn: her.breed.nameEn,
        }
      : NONE;
  }
  if (by === "band") {
    return bandLineOf(came, intake, facts);
  }
  // A haat and a trader are an Intake's: one who joined had neither, and says how she came instead.
  return came.how === "intake" ? boughtLineOf(by, intake) : { kind: came.how };
};

/** Named lines, bands and Animals first, in their own order; then none written; then those who joined. */
const LINE_RANK: Record<BreakdownLine["kind"], number> = {
  named: 0,
  band: 0,
  animal: 0,
  none: 1,
  crossed: 2,
  bought_from_venture: 3,
};

const byLine = (a: BreakdownLine, b: BreakdownLine): number => {
  const rank = LINE_RANK[a.kind] - LINE_RANK[b.kind];
  if (rank !== 0) {
    return rank;
  }
  // Each with a tie-break, so two traders of one name, or two bands from one weight, keep one order.
  if (a.kind === "named" && b.kind === "named") {
    return a.name.localeCompare(b.name, "bn") || a.id.localeCompare(b.id);
  }
  if (a.kind === "band" && b.kind === "band") {
    return fromOf(a) - fromOf(b) || toOf(a) - toOf(b);
  }
  if (a.kind === "animal" && b.kind === "animal") {
    return (
      a.tagNumber.localeCompare(b.tagNumber) || a.since.localeCompare(b.since)
    );
  }
  return 0;
};

/**
 * A finished Season opened out by haat, trader, breed, the Weight Band her buying weight fell in, or each Animal: every
 * line the Season's own sum narrowed to its Animals — what they cost, what came back, the dead in — so the lines add up
 * to the Season, each rounded to the taka as the Season is, so a line's paisa may put their sum a taka off it. A share
 * only: never put a year, because a year on a handful of animals leads the eye astray. Refused for a Season still
 * going, which is no result to judge the buying by.
 */
export const seasonBreakdown = async (
  db: Database,
  farm: ReturnsFarm,
  input: { seasonKey: string; by: BreakdownBy },
  now: Date
): Promise<BreakdownRow[]> => {
  const books = await booksOf(db, farm, now);
  const group = seasonGroupsOf(books).get(input.seasonKey);
  if (!group) {
    throw new ORPCError("NOT_FOUND", {
      message: "There is no such Season",
      data: { refusal: "no_such_season" },
    });
  }
  const worked = returnOfHoldings(
    books,
    null,
    group.holdings,
    now,
    farm.returnYearFloorDays
  );
  if (!worked.finished) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A Season still going is no result to open out",
      data: { refusal: "season_not_finished" },
    });
  }
  const facts = await buyingFactsOf(db, farm.id, group.holdings);
  const lines = new Map<
    string,
    { line: BreakdownLine; holdings: SeasonHolding[] }
  >();
  for (const holding of group.holdings) {
    const line = lineOf(input.by, holding, facts);
    const key = JSON.stringify(line);
    const one = lines.get(key) ?? { line, holdings: [] };
    one.holdings.push(holding);
    lines.set(key, one);
  }
  return [...lines.values()]
    .toSorted((a, b) => byLine(a.line, b.line))
    .map(({ line, holdings }) => {
      const returned = returnOf({
        spent: holdings.flatMap((one) => spentOn(books, null, one, now)),
        backBdt: backOf(holdings),
        floorDays: farm.returnYearFloorDays,
        finished: true,
      });
      return {
        line,
        head: holdings.length,
        died: holdings.filter((one) => one.left?.how === "died").length,
        costBdt: returned?.costBdt ?? 0,
        backBdt: returned?.backBdt ?? backOf(holdings),
        resultBdt: returned?.resultBdt ?? backOf(holdings),
        per100: returned?.per100 ?? null,
      };
    });
};

/** One dairy Animal's run and her calves', for her own page; nothing for one never on the Dairy side. */
export const dairyAnimalReturns = async (
  db: Database,
  farm: ReturnsFarm,
  animalId: string,
  now: Date
) => {
  const books = await booksOf(db, farm, now);
  const hers = await dairyAnimalOf(
    db,
    farm.id,
    books,
    animalId,
    farm.returnYearFloorDays,
    now
  );
  return hers ? { ...hers, floorDays: farm.returnYearFloorDays } : null;
};

/**
 * What one Investor's capital made on one Agreement in a settled Venture (ADR 0012): their own share of the profit over
 * all their capital, and the days from their first taka arriving to their payout — a span they can find on their own
 * papers, not the money-weighted average the Owner's rate a year is worked over. A share and its days, never a rate a
 * year. Nothing before the Venture is settled and their payout has gone.
 */
export const agreementReturnOnCapital = async (
  db: Pick<Database, "query">,
  farmId: string,
  agreementId: string
): Promise<{ per100: number; days: number } | null> => {
  const agreement = await db.query.investmentAgreement.findFirst({
    where: { id: agreementId, farmId },
    columns: { ventureId: true },
  });
  const venture = agreement
    ? await db.query.venture.findFirst({
        where: { id: agreement.ventureId, farmId },
        columns: { state: true },
      })
    : undefined;
  if (!(agreement && venture?.state === "settled")) {
    return null;
  }
  const approved = await approvedSettlementOf(db, farmId, agreement.ventureId);
  const share = approved?.shares.find((one) => one.agreementId === agreementId);
  if (!share) {
    return null;
  }
  const movements = await db.query.ventureMovement.findMany({
    where: { farmId, ventureId: agreement.ventureId },
    columns: {
      id: true,
      kind: true,
      agreementId: true,
      amountBdt: true,
      movedOn: true,
    },
  });
  const capital = capitalOf([share], movements);
  const returned = returnOnCapitalOf({
    capital,
    shareBdt: share.shareBdt,
    // No floor: nothing here is put a year.
    floorDays: 0,
  });
  const first = earliest(capital.map((one) => one.arrived));
  const paidBack = capital[0]?.paidBack;
  return returned && first && paidBack
    ? { per100: returned.per100, days: wholeDaysFrom(first, paidBack) }
    : null;
};

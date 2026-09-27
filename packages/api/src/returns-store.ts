import type { Database } from "@OpenFarm/db";
import type { Returned, Spent, TargetWindow } from "@OpenFarm/domain";
import {
  farmDayOf,
  returnOf,
  returnOnCapitalOf,
  seasonOf,
  startOfFarmDay,
} from "@OpenFarm/domain";

import type { FarmCosts } from "./cost-store";
import { farmCosts } from "./cost-store";
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

type BankRates = Awaited<ReturnType<typeof bankRatesOf>>;

/**
 * The Bank Rate a Season or a Venture reads: the one in force on the day its first taka went in, as a deposit made
 * that day would have locked it — and none for one with no rate a year to set it beside.
 */
const bankRateFor = (
  rates: BankRates,
  holdings: readonly Holding[],
  returned: Returned | null
): BankRateSaid | null => {
  if (
    returned?.perYear === null ||
    returned === null ||
    holdings.length === 0
  ) {
    return null;
  }
  const firstTaka = farmDayOf(
    new Date(Math.min(...holdings.map((one) => one.takenOn.getTime())))
  );
  const inForce = rates.find((one) => one.fromDay <= firstTaka);
  return inForce
    ? { perYear: inForce.perYear, note: inForce.note, fromDay: inForce.fromDay }
    : null;
};

/** What every sum on the page is read from, read once: the costing, whose each Animal was on a day, and every way an
 *  Animal came to an owner and left one. */
interface Books {
  costs: FarmCosts;
  ownedThenBy: OwnedThenBy;
  intakes: {
    animalId: string;
    purchasePriceBdt: number;
    arrivedAt: Date;
    targetWindowStart: string;
    targetWindowEnd: string;
  }[];
  died: Map<string, Date>;
  internal: {
    animalId: string;
    fromVentureId: string | null;
    toVentureId: string | null;
    priceBdt: number;
    createdAt: Date;
  }[];
}

const booksOf = async (db: Database, farmId: string): Promise<Books> => {
  // One client may be a transaction's, so these reads stay one after another.
  const costs = await farmCosts(db, farmId);
  const ownedThenBy = await ownedThenByOf(db, farmId);
  const intakes = await db.query.intake.findMany({
    where: { farmId },
    columns: {
      animalId: true,
      purchasePriceBdt: true,
      arrivedAt: true,
      targetWindowStart: true,
      targetWindowEnd: true,
    },
  });
  const deaths = await db.query.mortality.findMany({
    where: { farmId },
    columns: { animalId: true, happenedAt: true },
  });
  const internal = await db.query.internalSale.findMany({
    where: { farmId },
    columns: {
      animalId: true,
      fromVentureId: true,
      toVentureId: true,
      priceBdt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  return {
    costs,
    ownedThenBy,
    intakes,
    died: new Map(deaths.map((one) => [one.animalId, one.happenedAt])),
    internal,
  };
};

/** One share, whatever it was for. A dose of a product the farm had not bought by then is counted as the costing
 *  counts it: shown, never charged. */
const charged = (at: Date, side: string, bdt: number | null) => ({
  at,
  side,
  bdt: bdt ?? 0,
});

/** Every share charged to one Animal, with the day it was charged and the side she stood on. */
const sharesOf = (costs: FarmCosts, animalId: string) => {
  const hers = costs.ofAnimal;
  return [
    ...(hers.feed.get(animalId) ?? []).map((one) =>
      charged(one.at, one.side, one.feedBdt)
    ),
    ...(hers.doses.get(animalId) ?? []).map((one) =>
      charged(one.at, one.side, one.medicineBdt)
    ),
    ...(hers.vet.get(animalId) ?? []).map((one) =>
      charged(one.at, one.side, one.vetBdt)
    ),
    ...[
      ...(hers.hasil.get(animalId) ?? []),
      ...(hers.trips.get(animalId) ?? []),
      ...(hers.herd.get(animalId) ?? []),
    ].map((one) => charged(one.at, one.side, one.bdt)),
  ];
};

/**
 * How and when an Animal taken on by `owner` on `takenOn` left it: the first Internal Sale out of it after she came,
 * her Sale if she was still this owner's when she went, or her death. Null while she stands.
 */
const leftOf = (
  books: Books,
  owner: string | null,
  animalId: string,
  takenOn: Date
): Holding["left"] => {
  const soldOn = books.internal.find(
    (one) =>
      one.animalId === animalId &&
      one.fromVentureId === owner &&
      one.createdAt >= takenOn
  );
  if (soldOn) {
    return {
      how: "sold_to_venture",
      on: soldOn.createdAt,
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
 * her price, and every share charged while she was this owner's and on the Fattening side.
 */
const spentOn = (
  books: Books,
  owner: string | null,
  holding: Holding,
  today: Date
): Spent[] => {
  const until = holding.left?.on ?? today;
  const ours = (at: Date) =>
    at >= holding.takenOn &&
    at <= until &&
    books.ownedThenBy(holding.animalId, at) === owner;
  return [
    { bdt: holding.priceBdt, from: holding.takenOn, until },
    ...sharesOf(books.costs, holding.animalId)
      .filter((one) => one.side === "fattening" && ours(one.at))
      .map((one) => ({ bdt: one.bdt, from: one.at, until })),
  ];
};

/** What an owner's holdings together put in and brought back, and so what every hundred taka made. */
const returnOfHoldings = (
  books: Books,
  owner: string | null,
  holdings: readonly Holding[],
  today: Date,
  floorDays: number
) => {
  const finished = holdings.every((one) => one.left !== null);
  return {
    finished,
    returnOnCost: returnOf({
      spent: holdings.flatMap((one) => spentOn(books, owner, one, today)),
      backBdt: holdings.reduce((sum, one) => sum + (one.left?.backBdt ?? 0), 0),
      floorDays,
      finished,
    }),
  };
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
  returnOnCost: Returned | null;
  /** The Bank Rate in force on its first taka, beside its rate a year; none without one. */
  bankRate: BankRateSaid | null;
}

/**
 * The Farm's own fattening Animals grouped by the Target Window they were fed for: each Season with what it cost, what
 * came back, and so what every hundred taka made. An Animal stays in her Season however she went — sold before her
 * Eid, kept on after it, dead, or sold to a Venture — so a bad buy shows in the Season that made it.
 */
const seasonsOf = (
  books: Books,
  rates: BankRates,
  floorDays: number,
  today: Date
): SeasonReturn[] => {
  const bySeason = new Map<
    string,
    { season: ReturnType<typeof seasonOf>; holdings: Holding[] }
  >();
  for (const intake of books.intakes) {
    // The Farm's own only: a beast a Venture's money bought is that Venture's, and its Settlement's.
    if (books.ownedThenBy(intake.animalId, intake.arrivedAt) !== null) {
      continue;
    }
    const season = seasonOf({
      start: intake.targetWindowStart,
      end: intake.targetWindowEnd,
    });
    const group = bySeason.get(season.key) ?? { season, holdings: [] };
    group.holdings.push({
      animalId: intake.animalId,
      takenOn: intake.arrivedAt,
      priceBdt: intake.purchasePriceBdt,
      left: leftOf(books, null, intake.animalId, intake.arrivedAt),
    });
    bySeason.set(season.key, group);
  }
  return [...bySeason.values()]
    .map(({ season, holdings }) => {
      const worked = returnOfHoldings(books, null, holdings, today, floorDays);
      return {
        key: season.key,
        eid: season.eid,
        window: season.window,
        head: holdings.length,
        died: holdings.filter((one) => one.left?.how === "died").length,
        ...worked,
        bankRate: bankRateFor(rates, holdings, worked.returnOnCost),
      };
    })
    .toSorted(
      (a, b) =>
        b.window.start.localeCompare(a.window.start) ||
        a.key.localeCompare(b.key)
    );
};

/** A settled **Venture** as the Owner reads it on the Returns page. */
export interface VentureReturn {
  id: string;
  name: string;
  window: TargetWindow;
  head: number;
  died: number;
  /** On its cattle, worked from the same lines its Settlement adds up, and put a year over the days its money was out. */
  returnOnCost: Returned | null;
  /** On the Investors' capital, after the Farm's share: every taka from the day it arrived to the day it went back. */
  returnOnCapital: ReturnType<typeof returnOnCapitalOf>;
  /** The Farm's share, for its work: taka, never a ratio, because the Farm put in no money. */
  farmsShareBdt: number;
  /** The Bank Rate in force on its first taka, beside its rate a year; none without one. */
  bankRate: BankRateSaid | null;
}

/**
 * Each settled Venture: its cattle read exactly as a Season is — what they fetched, less what they cost to take on and
 * everything charged to them while they were its own — and the Investors' capital from the day it arrived to the day
 * it was paid back.
 */
const venturesOf = async (
  db: Database,
  farmId: string,
  books: Books,
  rates: BankRates,
  floorDays: number,
  today: Date
): Promise<VentureReturn[]> => {
  const settled = await db.query.venture.findMany({
    where: { farmId, state: "settled" },
    columns: {
      id: true,
      name: true,
      targetWindowStart: true,
      targetWindowEnd: true,
    },
    orderBy: { targetWindowStart: "desc", id: "asc" },
  });
  const movements =
    settled.length === 0
      ? []
      : await db.query.ventureMovement.findMany({
          where: {
            farmId,
            ventureId: { in: settled.map((one) => one.id) },
          },
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
  for (const venture of settled) {
    // oxlint-disable-next-line no-await-in-loop -- one Venture's Settlement at a time, on one client
    const approved = await approvedSettlementOf(db, farmId, venture.id);
    if (!approved) {
      continue;
    }
    const holdings: Holding[] = [
      ...books.intakes
        .filter(
          (one) => books.ownedThenBy(one.animalId, one.arrivedAt) === venture.id
        )
        .map((one) => ({
          animalId: one.animalId,
          takenOn: one.arrivedAt,
          priceBdt: one.purchasePriceBdt,
        })),
      ...books.internal
        .filter((one) => one.toVentureId === venture.id)
        .map((one) => ({
          animalId: one.animalId,
          takenOn: one.createdAt,
          priceBdt: one.priceBdt,
        })),
    ].map((one) => ({
      ...one,
      left: leftOf(books, venture.id, one.animalId, one.takenOn),
    }));
    const theirs = movements.filter((one) => one.ventureId === venture.id);
    const paidBackOn = new Map(
      theirs
        .filter((one) => one.kind === "payout")
        .map((one) => [one.id, startOfFarmDay(one.movedOn)])
    );
    const capital = approved.shares.flatMap((share) => {
      const paidBack = share.paidMovementId
        ? paidBackOn.get(share.paidMovementId)
        : undefined;
      if (!paidBack) {
        return [];
      }
      return theirs
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
    const { returnOnCost } = returnOfHoldings(
      books,
      venture.id,
      holdings,
      today,
      floorDays
    );
    out.push({
      id: venture.id,
      name: venture.name,
      window: {
        start: venture.targetWindowStart,
        end: venture.targetWindowEnd,
      },
      head: holdings.length,
      died: holdings.filter((one) => one.left?.how === "died").length,
      returnOnCost,
      returnOnCapital: returnOnCapitalOf({
        capital,
        shareBdt: approved.shares.reduce((sum, one) => sum + one.shareBdt, 0),
        floorDays,
      }),
      farmsShareBdt: approved.row.farmBdt,
      bankRate: bankRateFor(rates, holdings, returnOnCost),
    });
  }
  return out;
};

/** Everything the Owner's Returns page reads, worked once. */
export const returnsPage = async (
  db: Database,
  farm: { id: string; returnYearFloorDays: number },
  now: Date
) => {
  const books = await booksOf(db, farm.id);
  const bankRates = await bankRatesOf(db, farm.id);
  const floorDays = farm.returnYearFloorDays;
  const ventures = await venturesOf(
    db,
    farm.id,
    books,
    bankRates,
    floorDays,
    now
  );
  return {
    floorDays,
    seasons: seasonsOf(books, bankRates, floorDays, now),
    ventures,
    bankRates,
  };
};

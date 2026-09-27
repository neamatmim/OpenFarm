import type { Database } from "@OpenFarm/db";
import type { Returned, Spent } from "@OpenFarm/domain";
import {
  averageDaysOf,
  returnOf,
  returnOfTotals,
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

/** How an Animal left a run, or that she has not. */
type Gone = "sold" | "sold_to_venture" | "died";

/** One Animal's time in one run: what she was taken on at and when, and how and when she left it. */
interface Stay {
  animalId: string;
  takenOn: Date;
  priceBdt: number;
  left: { how: Gone; on: Date; backBdt: number } | null;
}

/** Every share charged to one Animal, whatever it was for, with the day it was charged and the side she stood on. A
 *  dose of a product the farm had not bought by then is counted as the costing counts it: shown, never charged. */
const charged = (at: Date, side: string, bdt: number | null) => ({
  at,
  side,
  bdt: bdt ?? 0,
});

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
 * What one stay put in, each sum out from the day it was spent until she left — or until `today`, for one standing:
 * her price, and every share charged while she was this run's own and on the Fattening side.
 */
const spentOn = (
  costs: FarmCosts,
  ownedThenBy: OwnedThenBy,
  owner: string | null,
  stay: Stay,
  today: Date
): Spent[] => {
  const until = stay.left?.on ?? today;
  const ours = (at: Date) =>
    at >= stay.takenOn &&
    at <= until &&
    ownedThenBy(stay.animalId, at) === owner;
  return [
    { bdt: stay.priceBdt, from: stay.takenOn, until },
    ...sharesOf(costs, stay.animalId)
      .filter((one) => one.side === "fattening" && ours(one.at))
      .map((one) => ({ bdt: one.bdt, from: one.at, until })),
  ];
};

/** Every way an Animal comes to an owner and leaves one, read once for the whole farm. */
const comingsAndGoingsOf = async (db: Database, farmId: string) => {
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
    intakes,
    died: new Map(deaths.map((one) => [one.animalId, one.happenedAt])),
    internal,
  };
};

type ComingsAndGoings = Awaited<ReturnType<typeof comingsAndGoingsOf>>;

/**
 * How and when an Animal taken on by `owner` on `takenOn` left it: the first Internal Sale out of it after she came,
 * her Sale if she was still this owner's when she went, or her death. Null while she stands.
 */
const leftOf = (
  costs: FarmCosts,
  ownedThenBy: OwnedThenBy,
  known: ComingsAndGoings,
  owner: string | null,
  animalId: string,
  takenOn: Date
): Stay["left"] => {
  const soldOn = known.internal.find(
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
  const sale = costs.animals.find((one) => one.id === animalId)?.sale;
  if (sale && ownedThenBy(animalId, sale.soldAt) === owner) {
    return { how: "sold", on: sale.soldAt, backBdt: sale.priceBdt };
  }
  const diedAt = known.died.get(animalId);
  return diedAt ? { how: "died", on: diedAt, backBdt: 0 } : null;
};

/** What a run's stays put in and brought back, and so what every hundred taka made. */
const returnOfStays = (
  costs: FarmCosts,
  ownedThenBy: OwnedThenBy,
  owner: string | null,
  stays: readonly Stay[],
  today: Date,
  floorDays: number
) => {
  const finished = stays.every((one) => one.left !== null);
  const spent = stays.flatMap((one) =>
    spentOn(costs, ownedThenBy, owner, one, today)
  );
  return {
    finished,
    spent,
    returnOnCost: returnOf({
      spent,
      backBdt: stays.reduce((sum, one) => sum + (one.left?.backBdt ?? 0), 0),
      floorDays,
      finished,
    }),
  };
};

/** A **Season** as the Owner reads it on the Returns page. */
export interface SeasonReturn {
  key: string;
  eid: string | null;
  window: { start: string; end: string };
  /** Whether every Animal in it has gone. Only then is it a result, and only then put a year. */
  finished: boolean;
  head: number;
  died: number;
  returnOnCost: Returned | null;
}

/**
 * The Farm's own fattening Animals grouped by the Target Window they were fed for: each Season with what it cost, what
 * came back, and so what every hundred taka made. An Animal stays in her Season however she went — sold before her
 * Eid, kept on after it, dead, or sold to a Venture — so a bad buy shows in the Season that made it.
 */
const seasonsOf = (
  farm: { returnYearFloorDays: number },
  costs: FarmCosts,
  ownedThenBy: OwnedThenBy,
  known: ComingsAndGoings,
  today: Date
): SeasonReturn[] => {
  const bySeason = new Map<
    string,
    { season: ReturnType<typeof seasonOf>; stays: Stay[] }
  >();
  for (const intake of known.intakes) {
    // The Farm's own only: a beast a Venture's money bought is that Venture's, and its Settlement's.
    if (ownedThenBy(intake.animalId, intake.arrivedAt) !== null) {
      continue;
    }
    const season = seasonOf({
      start: intake.targetWindowStart,
      end: intake.targetWindowEnd,
    });
    const group = bySeason.get(season.key) ?? { season, stays: [] };
    group.stays.push({
      animalId: intake.animalId,
      takenOn: intake.arrivedAt,
      priceBdt: intake.purchasePriceBdt,
      left: leftOf(
        costs,
        ownedThenBy,
        known,
        null,
        intake.animalId,
        intake.arrivedAt
      ),
    });
    bySeason.set(season.key, group);
  }
  return [...bySeason.values()]
    .map(({ season, stays }) => {
      const { finished, returnOnCost } = returnOfStays(
        costs,
        ownedThenBy,
        null,
        stays,
        today,
        farm.returnYearFloorDays
      );
      return {
        key: season.key,
        eid: season.eid,
        window: season.window,
        finished,
        head: stays.length,
        died: stays.filter((one) => one.left?.how === "died").length,
        returnOnCost,
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
  window: { start: string; end: string };
  settled: true;
  head: number;
  died: number;
  /** On its cattle: the Settlement's own figures, put a year over the days its money was out. */
  returnOnCost: Returned | null;
  /** On the Investors' capital, after the Farm's share: every taka from the day it arrived to the day it went back. */
  returnOnCapital: ReturnType<typeof returnOnCapitalOf>;
  /** The Farm's share, for its work: taka, never a ratio, because the Farm put in no money. */
  farmsShareBdt: number;
}

/**
 * Each settled Venture: its cattle read as a Season is — the Settlement's own proceeds and charges, so the two never
 * disagree, over the days the money was out, which the costing dates — and the Investors' capital from the day it
 * arrived to the day it was paid back.
 */
const venturesOf = async (
  db: Database,
  farm: { id: string; returnYearFloorDays: number },
  costs: FarmCosts,
  ownedThenBy: OwnedThenBy,
  known: ComingsAndGoings,
  today: Date
): Promise<VentureReturn[]> => {
  const settled = await db.query.venture.findMany({
    where: { farmId: farm.id, state: "settled" },
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
            farmId: farm.id,
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
    const approved = await approvedSettlementOf(db, farm.id, venture.id);
    if (!approved) {
      continue;
    }
    const cameIn: Stay[] = [
      ...known.intakes
        .filter(
          (one) => ownedThenBy(one.animalId, one.arrivedAt) === venture.id
        )
        .map((one) => ({
          animalId: one.animalId,
          takenOn: one.arrivedAt,
          priceBdt: one.purchasePriceBdt,
        })),
      ...known.internal
        .filter((one) => one.toVentureId === venture.id)
        .map((one) => ({
          animalId: one.animalId,
          takenOn: one.createdAt,
          priceBdt: one.priceBdt,
        })),
    ].map((one) => ({
      ...one,
      left: leftOf(
        costs,
        ownedThenBy,
        known,
        venture.id,
        one.animalId,
        one.takenOn
      ),
    }));
    const { spent } = returnOfStays(
      costs,
      ownedThenBy,
      venture.id,
      cameIn,
      today,
      farm.returnYearFloorDays
    );
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
    out.push({
      id: venture.id,
      name: venture.name,
      window: {
        start: venture.targetWindowStart,
        end: venture.targetWindowEnd,
      },
      settled: true,
      head: cameIn.length,
      died: cameIn.filter((one) => one.left?.how === "died").length,
      returnOnCost: returnOfTotals({
        costBdt: approved.row.chargedBdt,
        backBdt: approved.row.proceedsBdt,
        averageDays: averageDaysOf(spent) ?? 0,
        floorDays: farm.returnYearFloorDays,
        finished: true,
      }),
      returnOnCapital: returnOnCapitalOf({
        capital,
        shareBdt: approved.shares.reduce((sum, one) => sum + one.shareBdt, 0),
        floorDays: farm.returnYearFloorDays,
      }),
      farmsShareBdt: approved.row.farmBdt,
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
  // One client may be a transaction's, so these reads stay one after another.
  const costs = await farmCosts(db, farm.id);
  const ownedThenBy = await ownedThenByOf(db, farm.id);
  const known = await comingsAndGoingsOf(db, farm.id);
  const seasons = seasonsOf(farm, costs, ownedThenBy, known, now);
  const ventures = await venturesOf(db, farm, costs, ownedThenBy, known, now);
  return { floorDays: farm.returnYearFloorDays, seasons, ventures };
};

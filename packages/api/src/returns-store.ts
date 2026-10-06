import type { Database } from "@OpenFarm/db";
import type { JoiningHow } from "@OpenFarm/db/schema/fattening";
import type {
  Came,
  DairyBooks,
  Growth,
  Left,
  ReturnBooks,
  SeasonHolding,
  VentureReturn,
  WeightBand,
} from "@OpenFarm/domain";
import {
  EXIT_STATES,
  RUNNING_STATES,
  backOf,
  bandStanding,
  capitalOf,
  earliest,
  farmDayOf,
  rateInForceOn,
  returnOf,
  returnOfHoldings,
  returnOnCapitalOf,
  growthOfHoldings,
  seasonGroupsOf,
  seasonsOf,
  spentOn,
  handedOverAt,
  ventureReturnOf,
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
import { lostSince } from "./missing-store";
import { approvedSettlementOf } from "./settlement-store";
import { ownedThenByOf, whenEachCame } from "./venture-store";

/**
 * What the money in the farm's cattle returned, for the Owner's Returns page: the Books read once — the costing, whose
 * each Animal was on a day, every way an Animal came to an owner and left one, today's values and the Bank Rates — and
 * handed to the domain's `cattle-returns`, which works every Season and Venture from them. What is read here is only
 * read: every rule a figure follows is there, and tested there.
 */

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

/** The Books as the api reads them: what the domain works the Seasons and Ventures from, with the costing whole for
 *  the Dairy side, and the Bank Rates with their ids for the page to mark the one in force. */
type Books = Omit<ReturnBooks, "bankRates"> & {
  costs: FarmCosts;
  /** Every cow's litres to Bulk, for the Dairy side's runs. */
  litres: DairyBooks["litres"];
  bankRates: Awaited<ReturnType<typeof bankRatesOf>>;
};

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
  const came = await whenEachCame(db, farmId);
  const intakes = await db.query.intake.findMany({
    where: { farmId },
    columns: {
      id: true,
      animalId: true,
      purchasePriceMoney: true,
      arrivedAt: true,
      targetWindowStart: true,
      targetWindowEnd: true,
      weightKg: true,
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
      priceMoney: true,
      internalSaleId: true,
      weightKg: true,
    },
    orderBy: { joinedAt: "asc", id: "asc" },
  });
  const deaths = await db.query.mortality.findMany({
    where: { farmId },
    columns: { animalId: true, happenedAt: true },
  });
  const lost = await lostSince(db, farmId);
  // What the Farm paid each Venture to make its lost animals good: what came back for her.
  // In the order they were made: an animal made good twice is read by the last.
  const madeGood = await db.query.ventureMovement.findMany({
    where: { farmId, kind: "made_good", animalId: { isNotNull: true } },
    columns: { animalId: true, ventureId: true, amountMoney: true },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  const bankRates = await bankRatesOf(db, farmId);
  const internal = await db.query.internalSale.findMany({
    where: { farmId },
    columns: {
      id: true,
      animalId: true,
      fromVentureId: true,
      toVentureId: true,
      priceMoney: true,
      createdAt: true,
      soldOn: true,
    },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  // Every reading the farm did not doubt, for how a Season grew.
  const readings = await db.query.weighIn.findMany({
    where: { farmId, flaggedNote: { isNull: true } },
    columns: { animalId: true, weightKg: true, weighedAt: true },
  });
  const readingsOf = new Map<string, { kg: number; at: Date }[]>();
  for (const one of readings) {
    const hers = readingsOf.get(one.animalId) ?? [];
    hers.push({ kg: Number(one.weightKg), at: one.weighedAt });
    readingsOf.set(one.animalId, hers);
  }
  // What each standing Animal is worth today, exactly as the animal prices say it: never a third valuation.
  const priced = await pricesOnTheSide(db, farm, now);
  const values: Books["values"] = new Map(
    priced.animals.map((one) => [
      one.id,
      one.low && one.high
        ? { lowMoney: one.low.priceMoney, highMoney: one.high.priceMoney }
        : {
            tagNumber: one.tagNumber,
            why: one.latestKg === null ? "no_weight" : "no_price",
          },
    ])
  );
  return {
    costs,
    charges: costs.ofAnimal.charges,
    litres: costs.ofAnimal.litres,
    animals: costs.animals,
    joinings,
    weights: {
      came: new Map([
        ...intakes.map((one) => [one.id, Number(one.weightKg)] as const),
        ...joinings.map(
          (one) =>
            [
              one.id,
              one.weightKg === null ? null : Number(one.weightKg),
            ] as const
        ),
      ]),
      sold: new Map(
        costs.animals.flatMap((one) =>
          one.sale ? [[one.id, Number(one.sale.weightKg)] as const] : []
        )
      ),
      readings: readingsOf,
    },
    values,
    bankRates,
    ownedThenBy,
    intakes,
    died: new Map(deaths.map((one) => [one.animalId, one.happenedAt])),
    lost,
    madeGood: new Map(
      madeGood.flatMap((one) =>
        one.animalId
          ? [
              [
                one.animalId,
                { ventureId: one.ventureId, amountMoney: one.amountMoney },
              ] as const,
            ]
          : []
      )
    ),
    // The moment each sale handed her over, as whose she was reads it: never before she came.
    internal: internal.map(({ soldOn, ...one }) => ({
      ...one,
      on: handedOverAt(soldOn, came.get(one.animalId)),
    })),
  };
};

/** The states a Venture has cattle in, or had: the running ones, or settled. */
const WITH_CATTLE = [...RUNNING_STATES, "settled"] as const;

/**
 * Each Venture with cattle, worked from the Books as a Season is, with its approved Settlement once it is settled: what
 * it made then, the Farm's share, and the payouts its Investors' capital is counted to.
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
            amountMoney: true,
            movedOn: true,
          },
        });
  const out: VentureReturn[] = [];
  for (const venture of ventures) {
    const read = {
      id: venture.id,
      name: venture.name,
      window: {
        start: venture.targetWindowStart,
        end: venture.targetWindowEnd,
      },
    };
    if (venture.state !== "settled") {
      out.push(ventureReturnOf(books, read, null, floorDays, today));
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one Venture's Settlement at a time, on one client
    const approved = await approvedSettlementOf(db, farmId, venture.id);
    if (!approved) {
      continue;
    }
    out.push(
      ventureReturnOf(
        books,
        read,
        {
          profitMoney: approved.row.profitMoney,
          farmMoney: approved.row.farmMoney,
          shares: approved.shares,
          movements: movements.filter((one) => one.ventureId === venture.id),
        },
        floorDays,
        today
      )
    );
  }
  // One buying with no cattle yet has nothing to say — no cost, nothing back, nothing standing — so it is not listed.
  return out.filter((one) => one.head > 0);
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
        { priceMoney: { isNull: true } },
        { animal: { state: { notIn: [...EXIT_STATES] } } },
      ],
    },
    columns: {
      id: true,
      animalId: true,
      joinedOn: true,
      priceMoney: true,
      rateMoneyPerKg: true,
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
      priceMoney: row.priceMoney,
      rateMoneyPerKg:
        row.rateMoneyPerKg === null ? null : Number(row.rateMoneyPerKg),
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
  "livestockMarket",
  "trader",
  "breed",
  "band",
  "animal",
] as const;
export type BreakdownBy = (typeof BREAKDOWNS)[number];

/**
 * What one line of a breakdown is: a livestock market, a trader or a breed by its name; a Weight Band by its weights; one with none
 * of it written — the farm gate, no seller, no breed, no band her weight fell in; one who joined the Season other than
 * by Intake, who had no livestock market or trader; or one Animal, how she came and how she left.
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
      /** Never "crossed": that ends a Dairy Holding, and a Season's are Fattening ones. */
      left: Exclude<Left["how"], "crossed">;
    };

/** One line of a breakdown: its Animals' own share of the Season's sum. A share only, never put a year. */
export interface BreakdownRow {
  line: BreakdownLine;
  head: number;
  died: number;
  /** Written off as Lost. */
  lost: number;
  costMoney: number;
  backMoney: number;
  resultMoney: number;
  /** What every hundred taka made, to one place; null for a line that cost nothing. */
  per100: number | null;
  /** How its Animals grew: kilos a day, Days on Feed and Cost of Gain, pooled. */
  growth: Growth | null;
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

/** Where she was bought, or from whom: an Intake's livestock market, from her Buying Trip, or her seller. */
const boughtLineOf = (
  by: "livestockMarket" | "trader",
  intake: BoughtOn | undefined
): BreakdownLine => {
  if (by === "livestockMarket") {
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
    const how = holding.left?.how;
    return {
      kind: "animal",
      tagNumber: her?.tagNumber ?? "",
      came: came.how,
      since: farmDayOf(holding.takenOn),
      // A breakdown is of a finished Season, every one of whose Animals has left it, and never by crossing.
      left: how === undefined || how === "crossed" ? "sold" : how,
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
  // A livestock market and a trader are an Intake's: one who joined had neither, and says how she came instead.
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
 * Holdings grouped into the lines of a breakdown, each line worked as a Season is — what its Animals cost, what came
 * back, the dead in, a share only — in the breakdown's own order. One Season's breakdown and every Season's together
 * are both this, so the two cannot drift apart.
 */
const linesOf = (
  books: Books,
  farm: ReturnsFarm,
  holdings: readonly SeasonHolding[],
  by: BreakdownBy,
  facts: BuyingFacts,
  now: Date
): { row: BreakdownRow; holdings: SeasonHolding[] }[] => {
  const lines = new Map<
    string,
    { line: BreakdownLine; holdings: SeasonHolding[] }
  >();
  for (const holding of holdings) {
    const line = lineOf(by, holding, facts);
    const key = JSON.stringify(line);
    const one = lines.get(key) ?? { line, holdings: [] };
    one.holdings.push(holding);
    lines.set(key, one);
  }
  return [...lines.values()]
    .toSorted((a, b) => byLine(a.line, b.line))
    .map(({ line, holdings: its }) => {
      const returned = returnOf({
        spent: its.flatMap((one) => spentOn(books, null, one, now)),
        backMoney: backOf(its),
        floorDays: farm.returnYearFloorDays,
        finished: true,
      });
      return {
        holdings: its,
        row: {
          line,
          head: its.length,
          died: its.filter((one) => one.left?.how === "died").length,
          lost: its.filter((one) => one.left?.how === "lost").length,
          costMoney: returned?.costMoney ?? 0,
          backMoney: returned?.backMoney ?? backOf(its),
          resultMoney: returned?.resultMoney ?? backOf(its),
          per100: returned?.per100 ?? null,
          /** How this line's Animals grew, pooled: a seller whose bulls put on less is a seller to buy less from. */
          growth: growthOfHoldings(books, its, now),
        },
      };
    });
};

/**
 * A finished Season opened out by livestock market, trader, breed, the Weight Band her buying weight fell in, or each Animal: every
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
  return linesOf(books, farm, group.holdings, input.by, facts, now).map(
    ({ row }) => row
  );
};

/** The ways every finished Season opens out together: not into each Animal, since one line an animal over every year
 *  is a list, not a comparison. */
export const ACROSS_BREAKDOWNS = [
  "livestockMarket",
  "trader",
  "breed",
  "band",
] as const satisfies readonly BreakdownBy[];

/** One line across every finished Season: a Season's breakdown line, and how many Seasons its Animals came from — so a
 *  trader seen once does not read like one seen every Eid. */
export interface AcrossRow extends BreakdownRow {
  seasons: number;
}

/**
 * Every finished Season opened out together by livestock market, trader, breed or buying weight: each line pools its
 * Animals from all of them, worked by the same rule one Season's breakdown is, so the lines add up to the finished
 * Seasons on the page. The Farm's own Seasons only: a Venture is worked in its Settlement. A Season still going is in
 * no line. A share only, never put a year.
 */
export const breakdownAcross = async (
  db: Database,
  farm: ReturnsFarm,
  by: (typeof ACROSS_BREAKDOWNS)[number],
  now: Date
): Promise<{ seasons: number; lines: AcrossRow[] }> => {
  const books = await booksOf(db, farm, now);
  const finished = [...seasonGroupsOf(books).entries()].filter(
    ([, group]) =>
      returnOfHoldings(
        books,
        null,
        group.holdings,
        now,
        farm.returnYearFloorDays
      ).finished
  );
  const seasonOf = new Map<SeasonHolding, string>(
    finished.flatMap(([key, group]) =>
      group.holdings.map((one) => [one, key] as const)
    )
  );
  const holdings = [...seasonOf.keys()];
  const facts = await buyingFactsOf(db, farm.id, holdings);
  return {
    seasons: finished.length,
    lines: linesOf(books, farm, holdings, by, facts, now).map(
      ({ row, holdings: its }) => ({
        ...row,
        seasons: new Set(its.map((one) => seasonOf.get(one))).size,
      })
    ),
  };
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
      amountMoney: true,
      movedOn: true,
    },
  });
  const capital = capitalOf([share], movements);
  const returned = returnOnCapitalOf({
    capital,
    shareMoney: share.shareMoney,
    // No floor: nothing here is put a year.
    floorDays: 0,
  });
  const first = earliest(capital.map((one) => one.arrived));
  const paidBack = capital[0]?.paidBack;
  return returned && first && paidBack
    ? { per100: returned.per100, days: wholeDaysFrom(first, paidBack) }
    : null;
};

import type { Database } from "@OpenFarm/db";
import { and, desc, eq, gte } from "@OpenFarm/db/operators";
import { counterparty } from "@OpenFarm/db/schema/fattening";
import { dispatch } from "@OpenFarm/db/schema/milk";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import {
  MILK_ACCOUNT_DAYS,
  calvesDrankADay,
  farmDayOf,
  milkAccountOf,
  nameAsCompared,
  paidAtTheGate,
  roundLiters,
  roundMoney,
  startOfFarmDay,
  worthOfMilkSent,
} from "@OpenFarm/domain";
import type { MilkSent } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import { counterpartyNamed, knownAs } from "./counterparty-store";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf } from "./money-store";
import type { Raised } from "./notice";
import { tell } from "./notice";

/** One Dispatch as the day, the record and the reports read it. */
export interface DispatchRow {
  id: string;
  dispatchedAt: Date;
  liters: number;
  buyerName: string;
  buyerAddress: string | null;
  deliveryNote: string | null;
  /** Nothing while its price is to follow, and once a Buyer Statement has priced it: what a liter fetched is then its
   *  worth over its liters. */
  pricePerLiterMoney: number | null;
  /** Sent with its price to follow, and no Buyer Statement has priced it yet: liters, and no money. */
  priceToFollow: boolean;
  /** The Buyer Statement that priced it, where its price was to follow. */
  buyerStatementId: string | null;
  /** What its milk came to — its liters at its price, or what its Buyer Statement priced it at — and nothing while its
   *  price is still to follow. */
  worthMoney: number | null;
  fatPercent: number | null;
  snfPercent: number | null;
  /** What the buyer still owed for it as it left, and the farm day he promised to pay by, when he named one. */
  receivableMoney: number;
  promisedBy: string | null;
  note: string | null;
}

/** What a Dispatch's milk came to: its liters at its price, to the poisha. */
export const worthOfDispatch = (row: {
  liters: string | number;
  pricePerLiterMoney: string | number;
}): number => roundMoney(Number(row.liters) * Number(row.pricePerLiterMoney));

/** A Dispatch as whether its price is to follow, and what it came to, are read from it. */
export type DispatchPriced = MilkSent;

/** Sent with its price to follow, and not yet priced by a Buyer Statement. */
export const isPriceToFollow = (
  row: Pick<DispatchPriced, "pricePerLiterMoney" | "buyerStatementId">
): boolean => row.pricePerLiterMoney === null && row.buyerStatementId === null;

/** What a Dispatch's milk came to as it stands, read where the screen reads it too (`worthOfMilkSent`): nothing while
 *  its price is still to follow. */
export const worthAsItStands = worthOfMilkSent;

/** Every Dispatch in a stretch of time, oldest first, with the buyer as the farm had them that day. */
export const dispatchesBetween = async (
  db: Pick<Database, "query">,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<DispatchRow[]> => {
  const rows = await db.query.dispatch.findMany({
    where: { farmId, dispatchedAt: { gte: from, lt: until } },
    orderBy: { dispatchedAt: "asc", id: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    dispatchedAt: row.dispatchedAt,
    liters: Number(row.liters),
    buyerName: row.buyerName,
    buyerAddress: row.buyerAddress,
    deliveryNote: row.deliveryNote,
    pricePerLiterMoney:
      row.pricePerLiterMoney === null ? null : Number(row.pricePerLiterMoney),
    priceToFollow: isPriceToFollow(row),
    buyerStatementId: row.buyerStatementId,
    worthMoney: worthAsItStands(row),
    fatPercent: row.fatPercent === null ? null : Number(row.fatPercent),
    snfPercent: row.snfPercent === null ? null : Number(row.snfPercent),
    receivableMoney: row.receivableMoney,
    promisedBy: row.promisedBy,
    note: row.note,
  }));
};

/** Everything these Dispatches handed over, in liters. */
export const litersDispatched = (dispatches: readonly DispatchRow[]): number =>
  roundLiters(dispatches.reduce((sum, one) => sum + one.liters, 0));

/**
 * The liters the farm's Milk Records sent to Bulk in the Milking Sessions due in a stretch of time.
 *
 * By the Session, where a Dispatch goes by when the milk left: an evening's milk collected the next
 * morning is in the tank one day and out of the gate the next, and a day that shows both figures says
 * so rather than pretending they are the same milk.
 */
export const litersToBulkBetween = async (
  db: Pick<Database, "query">,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<number> => {
  const sessions = await db.query.milkingSession.findMany({
    where: { farmId, dueAt: { gte: from, lt: until } },
    columns: { id: true },
    with: {
      records: {
        where: { destination: "bulk" },
        columns: { liters: true },
      },
    },
  });
  return roundLiters(
    sessions
      .flatMap((one) => one.records)
      .reduce((sum, record) => sum + Number(record.liters), 0)
  );
};

export const buyerInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
});

export const dispatchFields = {
  dispatchedAt: z.coerce.date(),
  liters: z.number().positive().max(100_000),
  deliveryNote: z.string().trim().min(1).max(60),
  pricePerLiterMoney: z.number().positive().max(10_000),
  fatPercent: z.number().min(0).max(20),
  snfPercent: z.number().min(0).max(20),
  note: z.string().trim().min(1).max(300),
};

/** The Dispatch as the trail records it either side of a change. */
export const readDispatch = async (tx: Tx, id: string) => {
  const row = await tx.query.dispatch.findFirst({ where: { id } });
  return row
    ? { ...row, money: await moneySnapshotOf(tx, row.farmId, "dispatch", id) }
    : null;
};

/** How far back the farm looks for its milk buyers: a buyer who has taken nothing for half a year is not offered. */
const MILK_BUYERS_DAYS = 180;

/** How many of a buyer's latest Dispatches say whether he takes his milk on credit. */
const RECENT_RUN = 5;

/**
 * Whether a buyer takes his milk on credit, from his latest Dispatches, the latest first: more of his last five left with
 * all of it on credit than not. Milk sent with its price to follow was paid nothing at the gate.
 */
const paysLaterBy = (
  latestFirst: readonly {
    liters: string | number;
    pricePerLiterMoney: string | null;
    receivableMoney: number;
  }[]
): boolean => {
  const run = latestFirst.slice(0, RECENT_RUN);
  const allOnCredit = run.filter((one) =>
    one.pricePerLiterMoney === null
      ? true
      : one.receivableMoney > 0 &&
        one.receivableMoney >=
          worthOfDispatch({
            liters: one.liters,
            pricePerLiterMoney: one.pricePerLiterMoney,
          })
  ).length;
  return allOnCredit > run.length - allOnCredit;
};

/** A milk buyer as his recent milk left him: what the Dispatch sheet fills in once he is picked. */
export interface MilkBuyer {
  /** The Counterparty his milk is booked to, which his Buyer Statements name. */
  counterpartyId: string;
  /** His name as the farm keeps it, which a Dispatch sent with it finds again. */
  name: string;
  address: string | null;
  phone: string | null;
  /** The price his last milk priced at the gate went at, per liter; nothing where all of it went with its price to
   *  follow. */
  pricePerLiterMoney: number | null;
  /**
   * Whether he takes his milk on credit: more of his last five Dispatches left with all of it on credit than not — a
   * collection center that pays on its round. A Dispatch he paid any of at the gate counts as paid at the gate, so a
   * buyer who pays a part each time is not offered as taking it all on credit. Milk sent with its price to follow was
   * paid nothing at the gate.
   */
  paysLater: boolean;
  /** Whether his last milk went with its price to follow, for his statement to set: the sheet offers his next so. */
  priceToFollow: boolean;
}

/**
 * Every buyer the farm has handed milk to in the last half year, the most recent first, one for each name as
 * `nameAsCompared` compares names — named as the Counterparty `knownAs` finds, the one his next Dispatch is booked to,
 * with that Counterparty's address and phone. His price is his last Dispatch's.
 */
export const milkBuyersOf = async (
  db: Pick<Database, "select">,
  farmId: string,
  now: Date
): Promise<MilkBuyer[]> => {
  const since = new Date(
    now.getTime() - MILK_BUYERS_DAYS * 24 * 60 * 60 * 1000
  );
  const rows = await db
    .select({
      counterpartyId: counterparty.id,
      name: counterparty.name,
      liters: dispatch.liters,
      pricePerLiterMoney: dispatch.pricePerLiterMoney,
      receivableMoney: dispatch.receivableMoney,
    })
    .from(dispatch)
    .innerJoin(counterparty, eq(counterparty.id, dispatch.buyerId))
    .where(and(eq(dispatch.farmId, farmId), gte(dispatch.dispatchedAt, since)))
    .orderBy(desc(dispatch.dispatchedAt), desc(dispatch.id));
  // Latest first, so each name's first Dispatch is his last, and the names come in the order they last took milk.
  const byName = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = nameAsCompared(row.name);
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  const buyers: MilkBuyer[] = [];
  for (const [, theirs] of byName) {
    const [last] = theirs;
    if (!last) {
      continue;
    }
    // A buyer the farm keeps under one name; one read per buyer, and the farm has a handful.
    // oxlint-disable-next-line no-await-in-loop
    const known = await knownAs(db, farmId, last.name);
    const lastPriced = theirs.find((one) => one.pricePerLiterMoney !== null);
    buyers.push({
      counterpartyId: known?.id ?? last.counterpartyId,
      name: known?.name ?? last.name,
      address: known?.address ?? null,
      phone: known?.phone ?? null,
      pricePerLiterMoney:
        lastPriced?.pricePerLiterMoney === undefined ||
        lastPriced.pricePerLiterMoney === null
          ? null
          : Number(lastPriced.pricePerLiterMoney),
      paysLater: paysLaterBy(theirs),
      priceToFollow: last.pricePerLiterMoney === null,
    });
  }
  return buyers;
};

/** Nothing is paid at the gate for milk whose price is to follow: money said paid there was a price after all. */
export const assertNothingPaidToFollow = (paidMoney: number) => {
  if (paidMoney > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Nothing is paid at the gate for milk whose price is to follow",
      data: { refusal: "price_to_follow_paid" },
    });
  }
};

/**
 * Milk goes with its price to follow only to a buyer who takes it on credit — or one the farm has sent none to in half a
 * year, whose terms the sheet sets now. A buyer whose recent milk he paid for at the gate is priced at the gate: a
 * price to follow there would leave milk nobody will ever send a statement for.
 */
export const assertMayFollow = async (
  tx: Pick<Database, "query">,
  farmId: string,
  buyerId: string,
  now: Date
) => {
  const since = new Date(
    now.getTime() - MILK_BUYERS_DAYS * 24 * 60 * 60 * 1000
  );
  const recent = await tx.query.dispatch.findMany({
    where: { farmId, buyerId, dispatchedAt: { gte: since } },
    columns: { liters: true, pricePerLiterMoney: true, receivableMoney: true },
    orderBy: { dispatchedAt: "desc", id: "desc" },
    limit: RECENT_RUN,
  });
  if (recent.length > 0 && !paysLaterBy(recent)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "He pays for his milk at the gate: give it its price, or send it on credit",
      data: { refusal: "price_to_follow_pays_at_gate" },
    });
  }
};

/**
 * Books a Dispatch's milk sale as it now stands: what the buyer paid for it as it left — its liters at its price,
 * less whatever he still owed — to its buyer. Milk taken all on credit books nothing, unless it was booked before and a
 * Correction now puts it right.
 */
export const bookDispatchMoney = async (
  tx: Tx,
  booking: Booking,
  id: string,
  paymentMethod: PaymentMethod | undefined
) => {
  const row = await tx.query.dispatch.findFirst({ where: { id } });
  if (!row) {
    return;
  }
  const paidMoney = paidAtTheGate(
    worthAsItStands(row) ?? 0,
    row.receivableMoney
  );
  if (
    paidMoney > 0 ||
    (await moneySnapshotOf(tx, row.farmId, "dispatch", row.id))
  ) {
    await bookMoney(tx, booking, {
      source: "dispatch",
      sourceId: row.id,
      amountMoney: paidMoney,
      occurredAt: row.dispatchedAt,
      counterpartyId: row.buyerId,
      paymentMethod,
    });
  }
};

/** Milk has not left before now. */
export const assertNotLater = (dispatchedAt: Date, now: Date) => {
  if (dispatchedAt > now) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Milk cannot have left later than now",
      data: { refusal: "dispatched_in_the_future" },
    });
  }
};

/** A figure as the record keeps it: two decimals, as text. */
export const twoPlaces = (value: number | null | undefined) =>
  value === undefined || value === null ? null : value.toFixed(2);

/** The buyer as the Dispatch keeps them: the Counterparty, and their name and address as the farm has
 *  them on the day the milk left. */
export const buyerOnTheDay = async (
  tx: Tx,
  farmId: string,
  said: z.infer<typeof buyerInput>,
  now: Date
) => {
  const buyerId = await counterpartyNamed(tx, farmId, said, now);
  const buyer = await tx.query.counterparty.findFirst({
    where: { id: buyerId },
    columns: { name: true, address: true },
  });
  return {
    buyerId,
    buyerName: buyer?.name ?? said.name,
    buyerAddress: buyer?.address ?? null,
  };
};

/** How far before the week its Sessions and Dispatches are read, so the tank at its start can be read: long enough for
 *  a Dispatch to have come and gone. */
const TANK_LOOK_BACK_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The week's milk as the farm can account for it — into the tank, out of the gate, still in the tank, and what is left
 * — and beside it what the house drank in the week and what the calves drank, a day and a calf. By the same to-Bulk
 * figure the day view reads.
 */
export const milkAccountOn = async (
  db: Pick<Database, "query">,
  farmId: string,
  now: Date
) => {
  const startOfToday = startOfFarmDay(farmDayOf(now)).getTime();
  const weekFrom = new Date(startOfToday - (MILK_ACCOUNT_DAYS - 1) * DAY_MS);
  const readFrom = new Date(weekFrom.getTime() - TANK_LOOK_BACK_DAYS * DAY_MS);
  const [sessions, dispatches, calves] = await Promise.all([
    db.query.milkingSession.findMany({
      where: { farmId, dueAt: { gte: readFrom, lt: now } },
      columns: { dueAt: true },
      with: { records: { columns: { liters: true, destination: true } } },
    }),
    dispatchesBetween(db, farmId, { from: readFrom, until: now }),
    db.query.animal.findMany({
      where: { farmId, state: "calf", side: "dairy" },
      columns: { id: true },
    }),
  ]);
  const feeds: { at: Date; toCalves: number }[] = [];
  // Milk for the house in the week: never in the tank, so never what the tank is short by, and said apart so a week the
  // household drank its share reads as one.
  let toHouse = 0;
  const intoTheTank = sessions.map((one) => {
    let toBulk = 0;
    let toCalves = 0;
    for (const record of one.records) {
      if (record.destination === "bulk") {
        toBulk += Number(record.liters);
      } else if (record.destination === "calves") {
        toCalves += Number(record.liters);
      } else if (record.destination === "house" && one.dueAt >= weekFrom) {
        toHouse += Number(record.liters);
      }
    }
    feeds.push({ at: one.dueAt, toCalves });
    return { at: one.dueAt, toBulk };
  });
  const account = milkAccountOf(
    intoTheTank,
    dispatches.map((one) => ({ at: one.dispatchedAt, liters: one.liters })),
    weekFrom,
    now
  );
  const perDay = calvesDrankADay(feeds, new Date(startOfToday));
  return {
    ...account,
    since: farmDayOf(weekFrom),
    toHouse: roundLiters(toHouse),
    calves: {
      litersADay: roundLiters(perDay),
      calves: calves.length,
      perCalf: calves.length > 0 ? roundLiters(perDay / calves.length) : null,
    },
  };
};

/**
 * Tells the Owner and the Manager of the week's milk nobody can account for, once a farm day, while it is past the
 * Owner's line. Nothing when the week balances, or when more left the gate than the records put in the tank.
 */
export const tellOfUnaccountedMilk = async (
  tx: Tx,
  farm: { id: string; milkUnaccountedPercent: number },
  now: Date
): Promise<Raised[]> => {
  const account = await milkAccountOn(tx, farm.id, now);
  if (
    account.notAccounted <= 0 ||
    account.notAccountedPercent <= farm.milkUnaccountedPercent
  ) {
    return [];
  }
  return tell(
    tx,
    farm.id,
    {
      kind: "milk_unaccounted",
      about: { id: farmDayOf(now) },
      facts: {
        liters: account.notAccounted,
        percent: account.notAccountedPercent,
        since: account.since,
      },
    },
    now
  );
};

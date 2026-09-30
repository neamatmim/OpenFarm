import type { Database } from "@OpenFarm/db";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import {
  MILK_ACCOUNT_DAYS,
  farmDayOf,
  milkAccountOf,
  paidAtTheGate,
  roundLitres,
  roundTaka,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import { counterpartyNamed } from "./counterparty-store";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf } from "./money-store";
import type { Raised } from "./notice";
import { tell } from "./notice";

/** One Dispatch as the day, the record and the reports read it. */
export interface DispatchRow {
  id: string;
  dispatchedAt: Date;
  litres: number;
  buyerName: string;
  buyerAddress: string | null;
  challan: string | null;
  pricePerLitreBdt: number;
  fatPercent: number | null;
  snfPercent: number | null;
  /** What the buyer still owed for it as it left, and the farm day he promised to pay by, when he named one. */
  bakiBdt: number;
  promisedBy: string | null;
  note: string | null;
}

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
    litres: Number(row.litres),
    buyerName: row.buyerName,
    buyerAddress: row.buyerAddress,
    challan: row.challan,
    pricePerLitreBdt: Number(row.pricePerLitreBdt),
    fatPercent: row.fatPercent === null ? null : Number(row.fatPercent),
    snfPercent: row.snfPercent === null ? null : Number(row.snfPercent),
    bakiBdt: row.bakiBdt,
    promisedBy: row.promisedBy,
    note: row.note,
  }));
};

/** Everything these Dispatches handed over, in litres. */
export const litresDispatched = (dispatches: readonly DispatchRow[]): number =>
  roundLitres(dispatches.reduce((sum, one) => sum + one.litres, 0));

/**
 * The litres the farm's Milk Records sent to Bulk in the Milking Sessions due in a stretch of time.
 *
 * By the Session, where a Dispatch goes by when the milk left: an evening's milk collected the next
 * morning is in the tank one day and out of the gate the next, and a day that shows both figures says
 * so rather than pretending they are the same milk.
 */
export const litresToBulkBetween = async (
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
        columns: { litres: true },
      },
    },
  });
  return roundLitres(
    sessions
      .flatMap((one) => one.records)
      .reduce((sum, record) => sum + Number(record.litres), 0)
  );
};

export const buyerInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
});

export const dispatchFields = {
  dispatchedAt: z.coerce.date(),
  litres: z.number().positive().max(100_000),
  challan: z.string().trim().min(1).max(60),
  pricePerLitreBdt: z.number().positive().max(10_000),
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

/** What a Dispatch's milk came to: its litres at its price, to the poisha. */
export const worthOfDispatch = (row: {
  litres: string | number;
  pricePerLitreBdt: string | number;
}): number => roundTaka(Number(row.litres) * Number(row.pricePerLitreBdt));

/**
 * Books a Dispatch's milk sale as it now stands: what the buyer paid for it as it left — its litres at its price,
 * less whatever he still owed — to its buyer. Milk taken all on Baki books nothing, unless it was booked before and a
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
  const paidBdt = paidAtTheGate(worthOfDispatch(row), row.bakiBdt);
  if (
    paidBdt > 0 ||
    (await moneySnapshotOf(tx, row.farmId, "dispatch", row.id))
  ) {
    await bookMoney(tx, booking, {
      source: "dispatch",
      sourceId: row.id,
      amountBdt: paidBdt,
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
 * — and beside it what the calves drank, a day and a calf. By the same to-Bulk figure the day view reads.
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
      with: { records: { columns: { litres: true, destination: true } } },
    }),
    dispatchesBetween(db, farmId, { from: readFrom, until: now }),
    db.query.animal.findMany({
      where: { farmId, state: "calf", side: "dairy" },
      columns: { id: true },
    }),
  ]);
  let toCalves = 0;
  const intoTheTank = sessions.map((one) => {
    let toBulk = 0;
    for (const record of one.records) {
      if (record.destination === "bulk") {
        toBulk += Number(record.litres);
      } else if (record.destination === "calves" && one.dueAt >= weekFrom) {
        toCalves += Number(record.litres);
      }
    }
    return { at: one.dueAt, toBulk };
  });
  const account = milkAccountOf(
    intoTheTank,
    dispatches.map((one) => ({ at: one.dispatchedAt, litres: one.litres })),
    weekFrom,
    now
  );
  const perDay = toCalves / MILK_ACCOUNT_DAYS;
  return {
    ...account,
    since: farmDayOf(weekFrom),
    calves: {
      litresADay: roundLitres(perDay),
      calves: calves.length,
      perCalf: calves.length > 0 ? roundLitres(perDay / calves.length) : null,
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
        litres: account.notAccounted,
        percent: account.notAccountedPercent,
        since: account.since,
      },
    },
    now
  );
};

import type { Database } from "@OpenFarm/db";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { roundLitres } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import { counterpartyNamed } from "./counterparty-store";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf } from "./money-store";

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

/** Books a Dispatch's milk sale as it now stands: its litres at its price, to its buyer. */
export const bookDispatchMoney = async (
  tx: Tx,
  booking: Booking,
  id: string,
  paymentMethod: PaymentMethod | undefined
) => {
  const row = await tx.query.dispatch.findFirst({ where: { id } });
  if (row) {
    await bookMoney(tx, booking, {
      source: "dispatch",
      sourceId: row.id,
      amountBdt: Number(row.litres) * Number(row.pricePerLitreBdt),
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

import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { wageDraw, wageDrawTaken } from "@OpenFarm/db/schema/money";
import { roundTaka } from "@OpenFarm/domain";

import type { SnapshotValue, Tx } from "./audit";
import type { Booking } from "./money-store";
import { bookMoney } from "./money-store";
import { lockTheFarm } from "./venture-store";

// The Wage Draw: a person's money ahead of payday, its own Money Event under Wages the day it was drawn, and taken off
// the month's wage at payday — the oldest first — so nobody is paid twice.

type Db = Pick<Database, "query"> | Tx;

/** One draw, and what is still owed on it. */
export interface OpenDraw {
  id: string;
  counterpartyId: string;
  drawnAt: Date;
  amountBdt: number;
  openBdt: number;
  note: string | null;
}

/** Every draw still owed, the oldest first — of one person, or of everybody. */
export const openDrawsOf = async (
  db: Db,
  farmId: string,
  counterpartyId?: string
): Promise<OpenDraw[]> => {
  const draws = await db.query.wageDraw.findMany({
    where: { farmId, ...(counterpartyId ? { counterpartyId } : {}) },
    columns: {
      id: true,
      counterpartyId: true,
      drawnAt: true,
      amountBdt: true,
      note: true,
    },
    with: { taken: { columns: { bdt: true } } },
    orderBy: { drawnAt: "asc", id: "asc" },
  });
  return draws.flatMap(({ taken, ...one }) => {
    let takenBdt = 0;
    for (const part of taken) {
      takenBdt += part.bdt;
    }
    const openBdt = roundTaka(one.amountBdt - takenBdt);
    return openBdt > 0 ? [{ ...one, openBdt }] : [];
  });
};

/** Each person with draws still owed, and what they come to, the most owed first. */
export const drawsByPerson = async (db: Db, farmId: string) => {
  const open = await openDrawsOf(db, farmId);
  const people = await db.query.counterparty.findMany({
    where: {
      farmId,
      id: { in: [...new Set(open.map((one) => one.counterpartyId))] },
    },
    columns: { id: true, name: true },
  });
  const nameOf = new Map(people.map((one) => [one.id, one.name]));
  // How each was paid, from its Money Event — what a Correction of the draw is shown.
  const paid = await db.query.moneyEvent.findMany({
    where: {
      farmId,
      source: "wage_draw",
      sourceId: { in: open.map((one) => one.id) },
    },
    columns: { sourceId: true, paymentMethod: true },
  });
  const methodOf = new Map(
    paid.map((one) => [one.sourceId, one.paymentMethod])
  );
  const byPerson = new Map<
    string,
    (OpenDraw & { paymentMethod: PaymentMethod })[]
  >();
  for (const one of open) {
    byPerson.set(one.counterpartyId, [
      ...(byPerson.get(one.counterpartyId) ?? []),
      { ...one, paymentMethod: methodOf.get(one.id) ?? "cash" },
    ]);
  }
  return [...byPerson]
    .map(([counterpartyId, draws]) => {
      let openBdt = 0;
      for (const one of draws) {
        openBdt += one.openBdt;
      }
      return {
        counterpartyId,
        name: nameOf.get(counterpartyId) ?? "",
        openBdt: roundTaka(openBdt),
        draws,
      };
    })
    .toSorted((a, b) => b.openBdt - a.openBdt || a.name.localeCompare(b.name));
};

/**
 * A Wage Draw: the draw itself, and its money out of the hand that paid it, under Wages — the month's wage cost is the
 * draws and what payday pays, never either alone.
 */
export const recordWageDraw = async (
  tx: Tx,
  booking: Booking,
  input: {
    counterpartyId: string;
    amountBdt: number;
    drawnAt: Date;
    note: string | null;
    paymentMethod: PaymentMethod | undefined;
  }
): Promise<{ id: string }> => {
  const id = uuidv7(booking.now);
  await tx.insert(wageDraw).values({
    id,
    farmId: booking.farm.id,
    counterpartyId: input.counterpartyId,
    amountBdt: input.amountBdt,
    drawnAt: input.drawnAt,
    note: input.note,
    recordedBy: booking.actorId,
    recordedAt: booking.now,
  });
  await bookMoney(tx, booking, {
    source: "wage_draw",
    sourceId: id,
    categoryKey: "wages",
    amountBdt: input.amountBdt,
    occurredAt: input.drawnAt,
    counterpartyId: input.counterpartyId,
    paymentMethod: input.paymentMethod,
  });
  return { id };
};

/**
 * What a month's wage takes off a person's open draws, the oldest first, up to the wage — and so what is still to pay.
 * Worked out before the wage is booked, and written against it after.
 */
export const drawsToTake = async (
  tx: Tx,
  farmId: string,
  counterpartyId: string,
  wageBdt: number
): Promise<{ parts: { drawId: string; bdt: number }[]; takenBdt: number }> => {
  // Behind the Farm lock a draw put right takes too, so a payday never takes what a Correction is taking back.
  await lockTheFarm(tx, farmId);
  const open = await openDrawsOf(tx, farmId, counterpartyId);
  const parts: { drawId: string; bdt: number }[] = [];
  let left = wageBdt;
  for (const one of open) {
    if (left <= 0) {
      break;
    }
    const bdt = roundTaka(Math.min(left, one.openBdt));
    parts.push({ drawId: one.id, bdt });
    left = roundTaka(left - bdt);
  }
  return { parts, takenBdt: roundTaka(wageBdt - left) };
};

/** Writes what a wage took off each draw. */
export const takeDraws = async (
  tx: Tx,
  farmId: string,
  wageEventId: string,
  parts: readonly { drawId: string; bdt: number }[],
  now: Date
): Promise<void> => {
  for (const part of parts) {
    // One draw after another, a handful a month.
    // oxlint-disable-next-line no-await-in-loop
    await tx.insert(wageDrawTaken).values({
      id: uuidv7(now),
      farmId,
      drawId: part.drawId,
      wageEventId,
      bdt: part.bdt,
    });
  }
};

/** What a wage took off draws, where it took any: a wage that took draws is not put right by its amount alone. */
export const drawsTakenBy = async (
  db: Db,
  wageEventId: string
): Promise<number> => {
  const taken = await db.query.wageDrawTaken.findMany({
    where: { wageEventId },
    columns: { bdt: true },
  });
  let total = 0;
  for (const one of taken) {
    total += one.bdt;
  }
  return roundTaka(total);
};

/** What paydays have taken off one draw so far. */
export const takenOffDraw = async (db: Db, drawId: string): Promise<number> => {
  const taken = await db.query.wageDrawTaken.findMany({
    where: { drawId },
    columns: { bdt: true },
  });
  let total = 0;
  for (const one of taken) {
    total += one.bdt;
  }
  return roundTaka(total);
};

/** A draw as the trail keeps it: the draw, and what paydays have taken off it. */
export const readWageDraw = async (
  db: Db,
  id: string
): Promise<SnapshotValue> => {
  const row = await db.query.wageDraw.findFirst({ where: { id } });
  return row ? { ...row, takenBdt: await takenOffDraw(db, id) } : null;
};

import type { RoleName } from "@OpenFarm/db/schema/farm";
import type { SIDES } from "@OpenFarm/db/schema/herd";
import type { MoneyDirection, PaymentMethod } from "@OpenFarm/db/schema/money";
import { moneyReceipt } from "@OpenFarm/db/schema/money";
import { roundMoney, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";

import type { Tx } from "./audit";
import { assertTheHand } from "./cash-store";
import { lockTheFarm } from "./farm-lock";
import type { receiptInput } from "./money-inputs";
import {
  accountSaid,
  bookMoney,
  bookingOf,
  mayBeEnteredByHand,
} from "./money-store";
import { drawsToTake, takeDraws } from "./wage-draw-store";

/** Refused, with the word the screen says it in. */
export const refusedByHand = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

/** Money entered by hand as the trail records it: the Money Event, and when a receipt was kept — not the
 *  photo. */
export const readEntered = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.moneyEvent.findFirst({
    where: { id, farmId },
    with: { receipt: { columns: { updatedAt: true } } },
  });
  if (!row) {
    return null;
  }
  const { receipt, ...entry } = row;
  return { ...entry, receiptKeptAt: receipt?.updatedAt ?? null };
};

/**
 * Whether a Category charges what is entered under it to the animals — asked of a Category a Correction
 * would move money *to*, to find out whether that lands it on somebody's Venture. Its own comes back with
 * the record. False for a Category of another farm's, which charges nothing here.
 */
export const chargesTheAnimals = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  categoryId: string
): Promise<boolean> => {
  const category = await tx.query.moneyCategory.findFirst({
    where: { id: categoryId, farmId },
    columns: { chargedToAnimals: true },
  });
  return category?.chargedToAnimals ?? false;
};

/**
 * The Category money entered by hand goes under: this farm's, one a record does not book, and a wage's
 * month given exactly when it is a wage. A retired Category takes nothing new — but money already under
 * it stays correctable where it is.
 */
export const categoryForEntered = async (
  db: Pick<Tx, "query">,
  farmId: string,
  categoryId: string,
  {
    wageMonth,
    alreadyUnderIt,
  }: { wageMonth: string | null; alreadyUnderIt: boolean }
) => {
  const category = await db.query.moneyCategory.findFirst({
    where: { id: categoryId, farmId },
    columns: { id: true, key: true, direction: true, retiredAt: true },
  });
  if (!category) {
    throw new ORPCError("NOT_FOUND", { message: "No such Category" });
  }
  if (category.retiredAt && !alreadyUnderIt) {
    throw refusedByHand("That Category is retired", "category_retired");
  }
  if (!mayBeEnteredByHand(category.key)) {
    // Milk sold is booked by its Dispatch, a bull bought by its Intake: entering it by hand as well is
    // the same money twice.
    throw refusedByHand(
      "That Category's money comes from its own record",
      "category_kept_by_records"
    );
  }
  const isWage = category.key === "wages";
  if (isWage && wageMonth === null) {
    throw refusedByHand(
      "A wage names the month it pays for",
      "wage_needs_month"
    );
  }
  if (!isWage && wageMonth !== null) {
    throw refusedByHand("Only a wage pays for a month", "month_is_for_wages");
  }
  return category;
};

/** One wage per person per month: refusedByHand when this person's month is already paid, by another entry. */
export const assertWageNotYetEntered = async (
  tx: Tx,
  farmId: string,
  wage: { counterpartyId: string; wageMonth: string | null; id: string }
) => {
  if (wage.wageMonth === null) {
    return;
  }
  const already = await tx.query.moneyEvent.findFirst({
    // Every purse, not just the Farm's, so this agrees with the unique index that backs it: a wage is
    // the Farm's by definition — the Farm provides the labor — and one person is paid once for a month
    // whoever the money is thought to belong to.
    where: {
      farmId,
      counterpartyId: wage.counterpartyId,
      wageMonth: wage.wageMonth,
      id: { ne: wage.id },
    },
    columns: { id: true },
  });
  if (already) {
    throw refusedByHand(
      "That person's wage for that month is already entered",
      "wage_already_entered"
    );
  }
};

/** The farm day money moved, refusedByHand when that day has not come yet. */
export const enteredOn = (day: string, now: Date): Date => {
  const at = startOfFarmDay(day);
  if (at > now) {
    throw refusedByHand(
      "Money cannot have moved on a day that has not come yet",
      "entered_in_the_future"
    );
  }
  return at;
};

/** Keeps a receipt's photo, replacing one kept before. */
export const keepReceipt = async (
  tx: Tx,
  farmId: string,
  moneyEventId: string,
  receipt: z.infer<typeof receiptInput>,
  now: Date
) => {
  await tx
    .insert(moneyReceipt)
    .values({ moneyEventId, farmId, ...receipt, updatedAt: now })
    .onConflictDoUpdate({
      target: moneyReceipt.moneyEventId,
      set: { ...receipt, updatedAt: now },
    });
};

/** The database refusing a second wage for one person's month (`money_event_wage_uidx`). */
const isWageWrittenTwice = (error: unknown): boolean => {
  const said = error as {
    code?: unknown;
    constraint?: unknown;
    cause?: { code?: unknown; constraint?: unknown };
  } | null;
  const refused = said?.cause ?? said;
  return (
    refused?.code === "23505" && refused.constraint === "money_event_wage_uidx"
  );
};

/**
 * Books one entry made by hand, once its Counterparty is known, in the transaction it is written in: one wage a person a
 * month; a wage taking the person's draws still owed off itself, the oldest first, and booking what is paid now; the cash
 * in the hand named; over the Approval Threshold, waiting for the Owner. What a single entry and a month's wages share,
 * so a wage paid with the others is every bit the wage one paid alone is. Returns what the draws gave up to the wage.
 */
export const bookEnteredByHand = async (
  tx: Tx,
  writer: {
    farm: { id: string; approvalThresholdMoney: number };
    actor: { id: string };
    roles: readonly string[];
    role: RoleName;
  },
  entry: {
    id: string;
    category: { id: string; direction: MoneyDirection };
    occurredAt: Date;
    counterpartyId: string;
    amountMoney: number;
    paymentMethod: PaymentMethod;
    farmAccountId?: string;
    reference?: string;
    /** Whose hand the cash is in, where it is not the writer's. */
    heldBy?: string;
    note: string | null;
    wageMonth: string | null;
    side: (typeof SIDES)[number] | null;
    now: Date;
  }
): Promise<number> => {
  const farmId = writer.farm.id;
  if (entry.wageMonth) {
    // Behind the Farm lock, so two writing the same person's month at once — two phones, two runs — are asked one after
    // the other: the second finds the first and is refused in words, never by the index behind it.
    await lockTheFarm(tx, farmId);
  }
  await assertWageNotYetEntered(tx, farmId, {
    counterpartyId: entry.counterpartyId,
    wageMonth: entry.wageMonth,
    id: entry.id,
  });
  // A wage takes the person's draws still open off the month's wage, the oldest first, and books what is paid now: the
  // draws went out as money of their own the day they were drawn.
  const draws = entry.wageMonth
    ? await drawsToTake(tx, farmId, entry.counterpartyId, entry.amountMoney)
    : { parts: [], takenMoney: 0 };
  const heldBy =
    entry.paymentMethod === "cash"
      ? await assertTheHand(
          tx,
          farmId,
          { id: writer.actor.id, roles: writer.roles },
          entry.heldBy
        )
      : undefined;
  try {
    await bookMoney(
      tx,
      bookingOf(
        writer,
        writer.role,
        entry.now,
        accountSaid(["by_hand"], entry)
      ),
      {
        source: "by_hand",
        sourceId: entry.id,
        amountMoney: roundMoney(entry.amountMoney - draws.takenMoney),
        occurredAt: entry.occurredAt,
        counterpartyId: entry.counterpartyId,
        paymentMethod: entry.paymentMethod,
        ...(heldBy === undefined ? {} : { heldBy }),
      },
      {
        id: entry.id,
        category: entry.category,
        note: entry.note,
        wageMonth: entry.wageMonth,
        side: entry.side,
        drawsTakenMoney: draws.takenMoney,
      }
    );
  } catch (error) {
    // What the lock leaves to the index — a wage written under another purse's lock, say — is still said in words.
    if (isWageWrittenTwice(error)) {
      throw refusedByHand(
        "That person's wage for that month is already entered",
        "wage_already_entered"
      );
    }
    throw error;
  }
  await takeDraws(tx, farmId, entry.id, draws.parts, entry.now);
  return draws.takenMoney;
};

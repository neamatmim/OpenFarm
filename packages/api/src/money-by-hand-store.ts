import { moneyReceipt } from "@OpenFarm/db/schema/money";
import { startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";

import type { Tx } from "./audit";
import type { receiptInput } from "./money-inputs";
import { mayBeEnteredByHand } from "./money-store";

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
    // the Farm's by definition — the Farm provides the labour — and one person is paid once for a month
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

import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq, isNull, like, ne } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import type { MoneySource, PaymentMethod } from "@OpenFarm/db/schema/money";
import { moneyCategory, moneyEvent } from "@OpenFarm/db/schema/money";
import { approvalOf, roundTaka } from "@OpenFarm/domain";

import { holdersOf, raiseAlerts } from "./alerts-store";
import type { Tx } from "./audit";

/** The Category each record's money falls under, and which way it goes. */
const CATEGORIES: Record<
  MoneySource,
  { nameBn: string; nameEn: string; direction: "in" | "out" }
> = {
  dispatch: { nameBn: "দুধ বিক্রি", nameEn: "Milk sales", direction: "in" },
  sale: { nameBn: "গরু বিক্রি", nameEn: "Cattle sales", direction: "in" },
  intake: { nameBn: "গরু কেনা", nameEn: "Cattle purchases", direction: "out" },
  feed_in: { nameBn: "খাদ্য কেনা", nameEn: "Feed", direction: "out" },
  medicine_purchase: {
    nameBn: "ওষুধ কেনা",
    nameEn: "Medicine",
    direction: "out",
  },
  vet_fee: { nameBn: "ভেটের ফি", nameEn: "Vet fees", direction: "out" },
};

/** The Category a record's money falls under, made the first time the farm needs it. */
const categoryFor = async (
  tx: Tx,
  farmId: string,
  source: MoneySource,
  now: Date
): Promise<string> => {
  const known = await tx.query.moneyCategory.findFirst({
    where: { farmId, key: source },
    columns: { id: true },
  });
  if (known) {
    return known.id;
  }
  const id = newId(now);
  await tx.insert(moneyCategory).values({
    id,
    farmId,
    key: source,
    ...CATEGORIES[source],
    createdAt: now,
  });
  return id;
};

/** The money a farm record carries, as that record says it. */
export interface MoneyOfARecord {
  source: MoneySource;
  sourceId: string;
  amountBdt: number;
  occurredAt: Date;
  counterpartyId: string | null;
  /** How it was paid. Left out of a Correction, it stays as it was booked; left out of a first
   *  booking, cash. */
  paymentMethod?: PaymentMethod;
}

/** Who is writing the record, and the farm it is on. */
export interface Booking {
  farm: { id: string; approvalThresholdBdt: number };
  actorId: string;
  /** The Role the record is written under, which the Money Event is recorded under too. */
  role: RoleName;
  /** Whether the person writing it holds the Owner's Role: the Owner is not asked to approve their
   *  own money. */
  byTheOwner: boolean;
  now: Date;
}

/** The booking for a record this request is writing, now. */
export const bookingOf = (
  context: {
    farm: { id: string; approvalThresholdBdt: number };
    actor: { id: string };
    roles: readonly string[];
  },
  role: RoleName,
  now: Date
): Booking => ({
  farm: context.farm,
  actorId: context.actor.id,
  role,
  byTheOwner: context.roles.includes("owner"),
  now,
});

/** The notice about a Money Event waiting at this amount: a corrected amount is a new thing to approve. */
const noticeIdOf = (id: string, amountBdt: number) =>
  `${id}:${amountBdt.toFixed(2)}`;

/**
 * Takes down the Owner's notices about a Money Event that no longer waits at the amount they name —
 * approved, brought under the threshold, or corrected to another amount. A notice about money that is
 * not waiting is a notice that teaches the Owner to stop reading them.
 */
export const settleMoneyNotices = async (
  tx: Tx,
  farmId: string,
  moneyEventId: string,
  { stillWaitingAt, now }: { stillWaitingAt: number | null; now: Date }
): Promise<void> => {
  await tx
    .update(alert)
    .set({ dismissedAt: now })
    .where(
      and(
        eq(alert.farmId, farmId),
        eq(alert.kind, "money_awaiting_approval"),
        like(alert.entityId, `${moneyEventId}:%`),
        isNull(alert.dismissedAt),
        ...(stillWaitingAt === null
          ? []
          : [ne(alert.entityId, noticeIdOf(moneyEventId, stillWaitingAt))])
      )
    );
};

/** A Money Event as a record's trail shows it either side of a change, or null for a record with none. */
export const moneySnapshotOf = async (
  tx: Tx,
  source: MoneySource,
  sourceId: string
) =>
  (await tx.query.moneyEvent.findFirst({
    where: { source, sourceId },
    columns: {
      amountBdt: true,
      paymentMethod: true,
      approval: true,
      approvedBy: true,
      approvedAt: true,
    },
  })) ?? null;

/**
 * Books a record's money as its Money Event, in the record's own transaction: the first time the record
 * is written, a Money Event; every time it is corrected, the same Money Event put right.
 *
 * Over the Approval Threshold, money the Owner did not enter waits for the Owner, who hears about it in
 * the digest; the record itself is never held back (the Owner's decision, 2026-09-13). An approval is of
 * an amount, so a Correction that changes the amount asks again, and one that does not keeps it.
 */
export const bookMoney = async (
  tx: Tx,
  booking: Booking,
  money: MoneyOfARecord
): Promise<{ id: string; approval: string }> => {
  const { farm, now } = booking;
  const amountBdt = roundTaka(money.amountBdt);
  const existing = await tx.query.moneyEvent.findFirst({
    where: {
      farmId: farm.id,
      source: money.source,
      sourceId: money.sourceId,
    },
    columns: { id: true, amountBdt: true, approval: true },
  });
  const before = existing
    ? { amountBdt: Number(existing.amountBdt), approval: existing.approval }
    : undefined;
  const approval = approvalOf({
    amountBdt,
    thresholdBdt: farm.approvalThresholdBdt,
    enteredByTheOwner: booking.byTheOwner,
    before,
  });
  const fields = {
    amountBdt: amountBdt.toFixed(2),
    occurredAt: money.occurredAt,
    counterpartyId: money.counterpartyId,
    ...(money.paymentMethod === undefined
      ? {}
      : { paymentMethod: money.paymentMethod }),
    approval,
    ...(approval === "approved" ? {} : { approvedBy: null, approvedAt: null }),
  };
  const id = existing?.id ?? newId(now);
  await (existing
    ? tx.update(moneyEvent).set(fields).where(eq(moneyEvent.id, id))
    : tx.insert(moneyEvent).values({
        id,
        farmId: farm.id,
        direction: CATEGORIES[money.source].direction,
        categoryId: await categoryFor(tx, farm.id, money.source, now),
        source: money.source,
        sourceId: money.sourceId,
        recordedBy: booking.actorId,
        recordedByRole: booking.role,
        recordedAt: now,
        paymentMethod: "cash",
        ...fields,
      }));
  const waiting = approval === "awaiting";
  if (existing) {
    await settleMoneyNotices(tx, farm.id, id, {
      stillWaitingAt: waiting ? amountBdt : null,
      now,
    });
  }
  if (waiting) {
    // Raised once per amount: the unique index leaves a notice already standing where it is.
    await raiseAlerts(
      tx,
      farm.id,
      await holdersOf(tx, farm.id, ["owner"]),
      {
        kind: "money_awaiting_approval",
        entity: "money_event",
        entityId: noticeIdOf(id, amountBdt),
        params: {
          moneyEventId: id,
          amountBdt,
          categoryBn: CATEGORIES[money.source].nameBn,
          categoryEn: CATEGORIES[money.source].nameEn,
        },
      },
      now
    );
  }
  return { id, approval };
};

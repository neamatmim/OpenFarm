import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import type { MoneySource, PaymentMethod } from "@OpenFarm/db/schema/money";
import { moneyCategory, moneyEvent } from "@OpenFarm/db/schema/money";
import { approvalOf, roundTaka } from "@OpenFarm/domain";

import { holdersOf, raiseAlerts } from "./alerts-store";
import type { Tx } from "./audit";

/** The heading each record's money falls under, and which way it goes. */
const HEADINGS: Record<
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
    ...HEADINGS[source],
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

/** The booking for a record written under this Role, now. */
export const bookingOf = (
  context: {
    farm: { id: string; approvalThresholdBdt: number };
    actor: { id: string };
  },
  role: RoleName,
  now: Date
): Booking => ({ farm: context.farm, actorId: context.actor.id, role, now });

/** Who wrote the record, and the farm it is on. */
export interface Booking {
  farm: { id: string; approvalThresholdBdt: number };
  actorId: string;
  role: RoleName;
  now: Date;
}

/**
 * Books a record's money as its Money Event, in the record's own transaction: the first time the record
 * is written, a Money Event; every time it is corrected, the same Money Event put right.
 *
 * Over the Approval Threshold it waits for the Owner, who hears about it in the digest; the record
 * itself is never held back (the Owner's decision, 2026-09-13). An approval is of an amount, so a
 * Correction that changes the amount asks again, and one that does not keeps it.
 */
export const bookMoney = async (
  tx: Tx,
  booking: Booking,
  money: MoneyOfARecord
): Promise<{ id: string; approval: string }> => {
  const { farm, now } = booking;
  const amountBdt = roundTaka(money.amountBdt);
  const existing = await tx.query.moneyEvent.findFirst({
    where: { source: money.source, sourceId: money.sourceId },
    columns: { id: true, amountBdt: true, approval: true },
  });
  const before = existing
    ? { amountBdt: Number(existing.amountBdt), approval: existing.approval }
    : undefined;
  const approval = approvalOf({
    amountBdt,
    thresholdBdt: farm.approvalThresholdBdt,
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
        direction: HEADINGS[money.source].direction,
        categoryId: await categoryFor(tx, farm.id, money.source, now),
        source: money.source,
        sourceId: money.sourceId,
        recordedBy: booking.actorId,
        recordedByRole: booking.role,
        recordedAt: now,
        paymentMethod: "cash",
        ...fields,
      }));
  const newlyWaiting =
    approval === "awaiting" &&
    (before?.approval !== "awaiting" || before.amountBdt !== amountBdt);
  if (newlyWaiting) {
    await raiseAlerts(
      tx,
      farm.id,
      await holdersOf(tx, farm.id, ["owner"]),
      {
        kind: "money_awaiting_approval",
        entity: "money_event",
        // The amount waiting, not the row: a corrected amount is a new thing to approve.
        entityId: `${id}:${amountBdt.toFixed(2)}`,
        params: {
          moneyEventId: id,
          amountBdt,
          categoryBn: HEADINGS[money.source].nameBn,
          categoryEn: HEADINGS[money.source].nameEn,
        },
      },
      now
    );
  }
  return { id, approval };
};

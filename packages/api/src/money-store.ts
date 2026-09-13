import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq, isNull, like, ne } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import type {
  CategoryKey,
  MoneySource,
  PaymentMethod,
} from "@OpenFarm/db/schema/money";
import { moneyCategory, moneyEvent } from "@OpenFarm/db/schema/money";
import { approvalOf, roundTaka } from "@OpenFarm/domain";

import { holdersOf, raiseAlerts } from "./alerts-store";
import type { Tx } from "./audit";

/** The standard Categories: the one each record's money falls under, and the ones the rest of a dairy
 *  farm's month is made of — and which way each goes. */
const CATEGORIES: Record<
  CategoryKey,
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
  wages: { nameBn: "মজুরি", nameEn: "Wages", direction: "out" },
  utilities: { nameBn: "বিদ্যুৎ ও পানি", nameEn: "Utilities", direction: "out" },
  repairs: { nameBn: "মেরামত", nameEn: "Repairs", direction: "out" },
  transport: { nameBn: "পরিবহন", nameEn: "Transport", direction: "out" },
  manure_sales: {
    nameBn: "গোবর বিক্রি",
    nameEn: "Manure sales",
    direction: "in",
  },
};

/** The Categories a record's money is booked under, which the farm may not retire from under it. */
const KEPT_BY_RECORDS: ReadonlySet<CategoryKey> = new Set<CategoryKey>([
  "dispatch",
  "intake",
  "sale",
  "feed_in",
  "medicine_purchase",
  "vet_fee",
]);

/** Whether a record books its money under this Category, so that it is neither entered by hand nor
 *  retired. */
export const isKeptByRecords = (key: CategoryKey | null): boolean =>
  key !== null && KEPT_BY_RECORDS.has(key);

/** The standard Categories this farm does not have yet. */
export const missingStandardCategories = async (
  db: Pick<Tx, "query">,
  farmId: string
): Promise<CategoryKey[]> => {
  const have = await db.query.moneyCategory.findMany({
    where: { farmId, key: { isNotNull: true } },
    columns: { key: true },
  });
  const keys = new Set(have.map((one) => one.key));
  return (Object.keys(CATEGORIES) as CategoryKey[]).filter(
    (key) => !keys.has(key)
  );
};

/** Gives the farm these standard Categories. A name the farm already uses for one of its own is left as
 *  the farm's. */
export const addStandardCategories = async (
  tx: Tx,
  farmId: string,
  keys: readonly CategoryKey[],
  now: Date
): Promise<void> => {
  if (keys.length === 0) {
    return;
  }
  await tx
    .insert(moneyCategory)
    .values(
      keys.map((key) => ({
        id: newId(now),
        farmId,
        key,
        ...CATEGORIES[key],
        createdAt: now,
      }))
    )
    .onConflictDoNothing();
};

/** The standard Category a record's money is booked under. An entry made by hand chooses its own. */
const recordCategoryOf = (source: MoneySource): CategoryKey => {
  if (source === "entry") {
    throw new Error("An entry made by hand names its own Category");
  }
  return source;
};

/** The names of the Category a Money Event is under, for the notice about it. */
const categoryNamesOf = async (tx: Tx, moneyEventId: string) => {
  const row = await tx.query.moneyEvent.findFirst({
    where: { id: moneyEventId },
    with: { category: { columns: { nameBn: true, nameEn: true } } },
    columns: { id: true },
  });
  return {
    categoryBn: row?.category.nameBn ?? "",
    categoryEn: row?.category.nameEn ?? null,
  };
};

/** The standard Category a record's money falls under, made the first time the farm needs it. */
const categoryFor = async (
  tx: Tx,
  farmId: string,
  key: CategoryKey,
  now: Date
): Promise<string> => {
  const find = () =>
    tx.query.moneyCategory.findFirst({
      where: { farmId, key },
      columns: { id: true },
    });
  const known = await find();
  if (known) {
    return known.id;
  }
  await addStandardCategories(tx, farmId, [key], now);
  const made = await find();
  if (!made) {
    throw new Error(
      `The farm already has a Category named ${CATEGORIES[key].nameBn}`
    );
  }
  return made.id;
};

/** The Category a new Money Event is booked under, and so which way its money goes: the one the Manager
 *  chose for an entry, or the record's own standard one. */
const placedUnder = async (
  tx: Tx,
  farmId: string,
  source: MoneySource,
  byHand: EnteredByHand | undefined,
  now: Date
): Promise<{ categoryId: string; direction: "in" | "out" }> => {
  if (byHand) {
    return {
      categoryId: byHand.category.id,
      direction: byHand.category.direction,
    };
  }
  const key = recordCategoryOf(source);
  return {
    categoryId: await categoryFor(tx, farmId, key, now),
    direction: CATEGORIES[key].direction,
  };
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

/** What an entry made by hand carries beyond a record's money: its own id as the Money Event's, the
 *  Category the Manager chose, the note, and the month a wage pays for. */
export interface EnteredByHand {
  id: string;
  category: { id: string; direction: "in" | "out" };
  note: string | null;
  wageMonth: string | null;
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
  money: MoneyOfARecord,
  byHand?: EnteredByHand
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
    ...(byHand
      ? {
          categoryId: byHand.category.id,
          direction: byHand.category.direction,
          note: byHand.note,
          wageMonth: byHand.wageMonth,
        }
      : {}),
  };
  const id = existing?.id ?? byHand?.id ?? newId(now);
  await (existing
    ? tx.update(moneyEvent).set(fields).where(eq(moneyEvent.id, id))
    : tx.insert(moneyEvent).values({
        id,
        farmId: farm.id,
        ...(await placedUnder(tx, farm.id, money.source, byHand, now)),
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
          ...(await categoryNamesOf(tx, id)),
        },
      },
      now
    );
  }
  return { id, approval };
};

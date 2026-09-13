import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq, isNull, like } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import type { SIDES } from "@OpenFarm/db/schema/herd";
import type {
  CategoryKey,
  MoneyDirection,
  MoneySource,
  PaymentMethod,
} from "@OpenFarm/db/schema/money";
import {
  RECORD_SOURCES,
  moneyCategory,
  moneyEvent,
} from "@OpenFarm/db/schema/money";
import type { ApprovedTerms, MoneyApproval } from "@OpenFarm/domain";
import { approvalOf, roundTaka, termsUnchanged } from "@OpenFarm/domain";

import { holdersOf, raiseAlerts } from "./alerts-store";
import type { Tx } from "./audit";

/** The standard Categories: the one each record's money falls under, and the ones the rest of a dairy
 *  farm's month is made of — and which way each goes. */
const CATEGORIES: Record<
  CategoryKey,
  { nameBn: string; nameEn: string; direction: MoneyDirection }
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

/** The Categories a record books its money under. */
const KEPT_BY_RECORDS: ReadonlySet<CategoryKey> = new Set<CategoryKey>(
  RECORD_SOURCES
);

/**
 * Whether the farm may retire this Category. Not one a record books under — its money would have nowhere
 * to go — and not wages, which the one-wage-a-month rule is kept by.
 */
export const mayBeRetired = (key: CategoryKey | null): boolean =>
  key === null || !(KEPT_BY_RECORDS.has(key) || key === "wages");

/**
 * Whether money may be entered by hand under this Category. Not milk, cattle, feed or medicine, which their
 * own records book — twice would be the same money twice. A vet's fee may be: a visiting vet with no login
 * has a fee the Manager pays all the same.
 */
export const mayBeEnteredByHand = (key: CategoryKey | null): boolean =>
  key === null || key === "vet_fee" || !KEPT_BY_RECORDS.has(key);

/** Whether this Bangla name is one of the standard Categories', which the farm's own may not take. */
export const isStandardName = (nameBn: string): boolean =>
  Object.values(CATEGORIES).some((one) => one.nameBn === nameBn);

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
): Promise<CategoryKey[]> => {
  if (keys.length === 0) {
    return [];
  }
  const added = await tx
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
    .onConflictDoNothing()
    .returning({ key: moneyCategory.key });
  return added.flatMap((one) => (one.key === null ? [] : [one.key]));
};

/** The standard Category a record's money is booked under. An entry made by hand chooses its own. */
const recordCategoryOf = (source: MoneySource): CategoryKey => {
  if (source === "by_hand") {
    throw new Error("An entry made by hand names its own Category");
  }
  return source;
};

/** The names of the Category a Money Event is under, for the notice about it. */
const categoryNamesOf = async (
  tx: Tx,
  farmId: string,
  moneyEventId: string
) => {
  const row = await tx.query.moneyEvent.findFirst({
    where: { id: moneyEventId, farmId },
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
): Promise<{ categoryId: string; direction: MoneyDirection }> => {
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
  category: { id: string; direction: MoneyDirection };
  note: string | null;
  wageMonth: string | null;
  side: (typeof SIDES)[number] | null;
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

/**
 * Takes down the Owner's notices about a Money Event — approved, brought under the threshold, or changed
 * so that what the notice said is no longer what waits. A notice about money that is not waiting is a
 * notice that teaches the Owner to stop reading them.
 */
export const settleMoneyNotices = async (
  tx: Tx,
  farmId: string,
  moneyEventId: string,
  now: Date
): Promise<void> => {
  await tx
    .update(alert)
    .set({ dismissedAt: now })
    .where(
      and(
        eq(alert.farmId, farmId),
        eq(alert.kind, "money_awaiting_approval"),
        like(alert.entityId, `${moneyEventId}:%`),
        isNull(alert.dismissedAt)
      )
    );
};

/** A Money Event as a record's trail shows it either side of a change, or null for a record with none. */
export const moneySnapshotOf = async (
  tx: Tx,
  farmId: string,
  source: MoneySource,
  sourceId: string
) =>
  (await tx.query.moneyEvent.findFirst({
    where: { farmId, source, sourceId },
    columns: {
      amountBdt: true,
      paymentMethod: true,
      approval: true,
      approvedBy: true,
      approvedAt: true,
    },
  })) ?? null;

/** The columns a booking writes, whether it makes the Money Event or puts it right. */
const moneyFieldsOf = ({
  amountBdt,
  money,
  approval,
  byHand,
}: {
  amountBdt: number;
  money: MoneyOfARecord;
  approval: MoneyApproval;
  byHand: EnteredByHand | undefined;
}) => ({
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
        side: byHand.side,
      }
    : {}),
});

/**
 * Tells the Owner about money that has started waiting, and takes down what they were told about money
 * that no longer waits as they were told: approved, under the threshold, or changed. Money still waiting
 * exactly as it was is left alone — the Owner has already been told.
 */
const tellTheOwner = async (
  tx: Tx,
  { farm, now }: Booking,
  {
    id,
    amountBdt,
    approval,
    before,
    terms,
  }: {
    id: string;
    amountBdt: number;
    approval: MoneyApproval;
    before: { terms: ApprovedTerms; approval: MoneyApproval } | undefined;
    terms: ApprovedTerms;
  }
) => {
  const stillWaitingAsTold =
    approval === "awaiting" &&
    before?.approval === "awaiting" &&
    termsUnchanged(before.terms, terms);
  if (stillWaitingAsTold) {
    return;
  }
  if (before) {
    await settleMoneyNotices(tx, farm.id, id, now);
  }
  if (approval !== "awaiting") {
    return;
  }
  await raiseAlerts(
    tx,
    farm.id,
    await holdersOf(tx, farm.id, ["owner"]),
    {
      kind: "money_awaiting_approval",
      entity: "money_event",
      // One notice for each time it starts waiting: a corrected Money Event is a new thing to approve.
      entityId: `${id}:${newId(now)}`,
      params: {
        moneyEventId: id,
        amountBdt,
        ...(await categoryNamesOf(tx, farm.id, id)),
      },
    },
    now
  );
};

/**
 * Books a record's money as its Money Event, in the record's own transaction: the first time the record
 * is written, a Money Event; every time it is corrected, the same Money Event put right.
 *
 * Over the Approval Threshold, money the Owner did not enter waits for the Owner, who hears about it in
 * the digest; the record itself is never held back (the Owner's decision, 2026-09-13). An approval is of
 * its terms, so a Correction that changes the amount, the Counterparty or the Category asks again, and one
 * that does not keeps it.
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
    columns: {
      id: true,
      amountBdt: true,
      approval: true,
      counterpartyId: true,
      categoryId: true,
      direction: true,
    },
  });
  const id = existing?.id ?? byHand?.id ?? newId(now);
  const placed = existing
    ? {
        categoryId: byHand?.category.id ?? existing.categoryId,
        direction: byHand?.category.direction ?? existing.direction,
      }
    : await placedUnder(tx, farm.id, money.source, byHand, now);
  const terms = {
    amountBdt,
    counterpartyId: money.counterpartyId,
    categoryId: placed.categoryId,
  };
  const before = existing
    ? {
        terms: {
          amountBdt: Number(existing.amountBdt),
          counterpartyId: existing.counterpartyId,
          categoryId: existing.categoryId,
        },
        approval: existing.approval,
      }
    : undefined;
  const approval = approvalOf({
    terms,
    thresholdBdt: farm.approvalThresholdBdt,
    enteredByTheOwner: booking.byTheOwner,
    before,
  });
  const fields = moneyFieldsOf({ amountBdt, money, approval, byHand });
  await (existing
    ? tx.update(moneyEvent).set(fields).where(eq(moneyEvent.id, id))
    : tx.insert(moneyEvent).values({
        id,
        farmId: farm.id,
        categoryId: placed.categoryId,
        direction: placed.direction,
        source: money.source,
        sourceId: money.sourceId,
        recordedBy: booking.actorId,
        recordedByRole: booking.role,
        recordedAt: now,
        paymentMethod: "cash",
        ...fields,
      }));
  await tellTheOwner(tx, booking, { id, amountBdt, approval, before, terms });
  return { id, approval };
};

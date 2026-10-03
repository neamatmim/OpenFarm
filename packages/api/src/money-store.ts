import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq, gte, isNull, like, lt, sql } from "@OpenFarm/db/operators";
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
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { nameTaken } from "./names";
import { tell } from "./notice";

/** The standard Categories: the one each record's money falls under, and the ones the rest of a dairy
 *  farm's month is made of — and which way each goes. */
const CATEGORIES: Record<
  CategoryKey,
  { nameBn: string; nameEn: string; direction: MoneyDirection }
> = {
  dispatch: { nameBn: "দুধ বিক্রি", nameEn: "Milk sales", direction: "in" },
  sale: { nameBn: "গরু বিক্রি", nameEn: "Cattle sales", direction: "in" },
  intake: { nameBn: "গরু কেনা", nameEn: "Cattle purchases", direction: "out" },
  buying_trip: {
    nameBn: "হাটে যাওয়ার খরচ",
    nameEn: "Buying trips",
    direction: "out",
  },
  selling_trip: {
    nameBn: "হাটে বিক্রির খরচ",
    nameEn: "Selling trips",
    direction: "out",
  },
  wage_draw: {
    nameBn: "বেতনের অগ্রিম",
    nameEn: "Wage draws",
    direction: "out",
  },
  sale_broker: {
    nameBn: "বিক্রির দালালি",
    nameEn: "Sale brokers",
    direction: "out",
  },
  internal_sale_in: {
    nameBn: "ভেঞ্চারের কাছে গরু বিক্রি",
    nameEn: "Cattle sold to a Venture",
    direction: "in",
  },
  internal_sale_out: {
    nameBn: "ভেঞ্চার থেকে গরু কেনা",
    nameEn: "Cattle bought from a Venture",
    direction: "out",
  },
  reimbursement: {
    nameBn: "ভেঞ্চারের খরচ ফেরত",
    nameEn: "Reimbursed by a Venture",
    direction: "in",
  },
  settlement_adjustment: {
    nameBn: "হিসাব সমন্বয়ে বাড়তি দেওয়া",
    nameEn: "Paid on a Settlement Adjustment",
    direction: "out",
  },
  farm_share: {
    nameBn: "ভেঞ্চার পরিচালনার ভাগ",
    nameEn: "The Farm's share of a Venture",
    direction: "in",
  },
  farm_loss: {
    nameBn: "ভেঞ্চারের লোকসানে খামারের ভাগ",
    nameEn: "The Farm's share of a Venture's loss",
    direction: "out",
  },
  feed_in: { nameBn: "খাদ্য কেনা", nameEn: "Feed", direction: "out" },
  medicine_purchase: {
    nameBn: "ওষুধ কেনা",
    nameEn: "Medicine",
    direction: "out",
  },
  vet_fee: { nameBn: "ভেটের ফি", nameEn: "Vet fees", direction: "out" },
  wages: { nameBn: "মজুরি", nameEn: "Wages", direction: "out" },
  rent: { nameBn: "শেড ভাড়া", nameEn: "Shed rent", direction: "out" },
  utilities: { nameBn: "বিদ্যুৎ ও পানি", nameEn: "Utilities", direction: "out" },
  repairs: { nameBn: "মেরামত", nameEn: "Repairs", direction: "out" },
  hygiene: {
    nameBn: "শেড পরিষ্কার",
    nameEn: "Shed hygiene",
    direction: "out",
  },
  equipment: { nameBn: "যন্ত্রপাতি", nameEn: "Equipment", direction: "out" },
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

/**
 * The standard Categories the animals never carry: the place, the people and the kit, which are the
 * Farm's and are how it earns its share.
 *
 * All six have a key for this reason. Shed hygiene and equipment are as much the Farm's as wages are —
 * spec story 45 and CONTEXT.md's **Herd Cost** both say so — but until they were standard Categories a
 * farm had to invent its own to record them, and a farm's own Category may be marked. The key is what
 * lets this list reach them, and `isStandardName` is what stops the same name being added around it.
 */
const NEVER_THE_ANIMALS: ReadonlySet<CategoryKey> = new Set<CategoryKey>([
  "wages",
  "rent",
  "utilities",
  "repairs",
  "hygiene",
  "equipment",
]);

/**
 * Whether the Owner may mark this Category as one the animals of its Side carry. Money coming in never is —
 * it is not a cost — and neither are wages, utilities or repairs, which are the place and the people and
 * stay the Farm's (the Owner's decision, 2026-09-17).
 */
export const mayBeChargedToAnimals = (category: {
  key: CategoryKey | null;
  direction: MoneyDirection;
}): boolean =>
  category.direction === "out" &&
  !(category.key !== null && NEVER_THE_ANIMALS.has(category.key));

/**
 * Whether the Owner may mark this Category as paid every month — a **Monthly Cost** — so a month with nothing under it
 * is named. Money going out that no record books: money coming in is nobody's to chase, and a record's money arrives
 * with the record — a Vet's fee among them, though a visiting vet's may be entered by hand, since it comes with a
 * visit and not with the month. Not Wages, which is one Category over many people and is watched by the person instead.
 */
export const mayBePaidMonthly = (category: {
  key: CategoryKey | null;
  direction: MoneyDirection;
}): boolean =>
  category.direction === "out" &&
  (category.key === null || !KEPT_BY_RECORDS.has(category.key)) &&
  category.key !== "wages";

/** Whether one of the standard Categories goes by either of these names — which the farm's own may not take, in
 *  either language, whatever the capitals. */
export const isStandardName = (names: {
  bn: string;
  en?: string | null;
}): boolean =>
  nameTaken(
    Object.entries(CATEGORIES).map(([key, one]) => ({
      id: key,
      nameBn: one.nameBn,
      nameEn: one.nameEn,
    })),
    names
  );

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
const recordCategoryOf = (
  source: MoneySource,
  categoryKey: CategoryKey | undefined
): CategoryKey => {
  if (categoryKey) {
    return categoryKey;
  }
  if (source === "by_hand") {
    throw new Error("An entry made by hand names its own Category");
  }
  if (source === "baki_payment") {
    throw new Error(
      "A Baki Payment names the Category of what it paid for: milk sales or cattle sales"
    );
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
  money: Pick<MoneyOfARecord, "source" | "categoryKey">,
  byHand: EnteredByHand | undefined,
  now: Date
): Promise<{ categoryId: string; direction: MoneyDirection }> => {
  if (byHand) {
    return {
      categoryId: byHand.category.id,
      direction: byHand.category.direction,
    };
  }
  const key = recordCategoryOf(money.source, money.categoryKey);
  return {
    categoryId: await categoryFor(tx, farmId, key, now),
    direction: CATEGORIES[key].direction,
  };
};

/** The money a farm record carries, as that record says it. */
/**
 * The Farm's own purse, as a reader asks for it. Every reader of the Farm's money says this and not the
 * shape behind it, so the next reader that forgets is visible as the one that does not say it.
 */
export const THE_FARMS_PURSE = { isNull: true } as const;

/** What a period's money comes to, in and out, and how many entries wait for the Owner's word. */
export interface MoneyTotals {
  inBdt: number;
  outBdt: number;
  awaiting: number;
}

/**
 * A period's money told by the farm, from every entry in it — the Farm's own, or one Venture's — however many the
 * register shows: a phone adding up the rows it was sent would be short in any month busier than the list is long.
 */
export const moneyTotalsOf = async (
  db: Pick<Tx, "select">,
  farmId: string,
  {
    ventureId,
    from,
    until,
  }: { ventureId: string | undefined; from: Date; until: Date }
): Promise<MoneyTotals> => {
  const rows = await db
    .select({
      direction: moneyEvent.direction,
      totalBdt: sql<string>`coalesce(sum(${moneyEvent.amountBdt}), 0)`,
      awaiting: sql<number>`(count(*) filter (where ${moneyEvent.approval} = 'awaiting'))::int`,
    })
    .from(moneyEvent)
    .where(
      and(
        eq(moneyEvent.farmId, farmId),
        ventureId === undefined
          ? isNull(moneyEvent.purseVentureId)
          : eq(moneyEvent.purseVentureId, ventureId),
        gte(moneyEvent.occurredAt, from),
        lt(moneyEvent.occurredAt, until)
      )
    )
    .groupBy(moneyEvent.direction);
  const totalOf = (direction: "in" | "out") =>
    roundTaka(
      Number(rows.find((row) => row.direction === direction)?.totalBdt ?? 0)
    );
  return {
    inBdt: totalOf("in"),
    outBdt: totalOf("out"),
    awaiting: rows.reduce((sum, row) => sum + Number(row.awaiting), 0),
  };
};

export interface MoneyOfARecord {
  source: MoneySource;
  sourceId: string;
  amountBdt: number;
  occurredAt: Date;
  counterpartyId: string | null;
  /** How it was paid. Left out of a Correction, it stays as it was booked; left out of a first
   *  booking, cash. */
  paymentMethod?: PaymentMethod;
  /** Whose hand the cash went into or came out of, where the record says; left out, the person writing it. */
  heldBy?: string | null;
  /** Whose money moved: left out or null, the Farm's own; a Venture's id, that Venture's. Set by the
   *  record that knows — an Intake of a Venture's Animal, a Sale of one. The Farm's reports read the
   *  Farm's purse alone, so this is what keeps the two from mixing. */
  purseVentureId?: string | null;
  /** The Category it books under, for a record whose own source does not say: a Baki Payment books under what it paid
   *  for — the Dispatch's milk sales or the Sale's cattle sales. Every other record leaves it out. */
  categoryKey?: CategoryKey;
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

/** Which Farm Account a record's bKash or bank money names, and its transaction ID — as the form said it, for the one
 *  Money Event of the record it is about. */
export interface AccountSaid {
  /** The Money Events of the record it is about: a Sale's money, and not its broker's. */
  sources: readonly MoneySource[];
  farmAccountId?: string;
  reference?: string;
}

/** Which Farm Account a record's Money Event names, and its reference, as a Correction is shown them. */
export const farmAccountShownOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  source: MoneySource,
  sourceId: string
): Promise<{ farmAccountId: string | null; reference: string | null }> => {
  const money = await tx.query.moneyEvent.findFirst({
    where: { farmId, source, sourceId },
    columns: { farmAccountId: true, reference: true },
  });
  return {
    farmAccountId: money?.farmAccountId ?? null,
    reference: money?.reference ?? null,
  };
};

/** The Farm Account and reference a form named, for the Money Events of these sources. */
export const accountSaid = (
  sources: readonly MoneySource[],
  input: { farmAccountId?: string; reference?: string }
): AccountSaid => ({
  sources,
  ...(input.farmAccountId === undefined
    ? {}
    : { farmAccountId: input.farmAccountId }),
  ...(input.reference === undefined ? {} : { reference: input.reference }),
});

/** Who is writing the record, and the farm it is on. */
export interface Booking {
  /** The Farm Account and reference the form named, where it named one (`farmAccountOf`). */
  account?: AccountSaid;
  farm: { id: string; approvalThresholdBdt: number };
  actorId: string;
  /** The Role the record is written under, which the Money Event is recorded under too. */
  role: RoleName;
  /** Whether the person writing it holds the Owner's Role: the Owner is not asked to approve their
   *  own money. */
  byTheOwner: boolean;
  now: Date;
}

/** The Roles whose hands the farm's cash passes through: a Vet writing their own fee, or Barn Staff, hold none of it. */
const HOLDS_CASH: ReadonlySet<RoleName> = new Set(["owner", "manager"]);

/**
 * Whose **Cash in Hand** a Money Event names: nobody for bKash or the bank; the hand the record names, where it names
 * one; else the hand it already named. A new cash one is the person writing it — who took the buyer's notes or paid the
 * lorry — where they hold the farm's cash; and so is one put right to cash. One booked before hands were named, and
 * still cash, stays nobody's: the first Cash Count says what each hand really holds.
 */
const handOf = (
  booking: Booking,
  money: Pick<MoneyOfARecord, "paymentMethod" | "heldBy">,
  existing: { paymentMethod: string; heldBy: string | null } | undefined
): string | null => {
  const method = money.paymentMethod ?? existing?.paymentMethod ?? "cash";
  if (method !== "cash") {
    return null;
  }
  if (money.heldBy !== undefined) {
    return money.heldBy;
  }
  const alreadyCash = existing?.paymentMethod === "cash";
  if (existing && alreadyCash) {
    return existing.heldBy;
  }
  return HOLDS_CASH.has(booking.role) ? booking.actorId : null;
};

/** The booking for a record this request is writing, now. */
export const bookingOf = (
  context: {
    farm: { id: string; approvalThresholdBdt: number };
    actor: { id: string };
    roles: readonly string[];
  },
  role: RoleName,
  now: Date,
  /** The Farm Account and reference the form named for this record's money. */
  account?: AccountSaid
): Booking => ({
  farm: context.farm,
  actorId: context.actor.id,
  role,
  byTheOwner: context.roles.includes("owner"),
  now,
  ...(account ? { account } : {}),
});

const refuse = (refusal: string, message: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

type ExistingMoney =
  | {
      id: string;
      paymentMethod: string;
      farmAccountId: string | null;
      reference: string | null;
    }
  | undefined;

/** What the form named for this money, or, where it named nothing and the method is unchanged, what was named before. */
const accountAsked = (
  booking: Booking,
  money: MoneyOfARecord,
  existing: ExistingMoney,
  method: string
) => {
  const said = booking.account?.sources.includes(money.source)
    ? booking.account
    : undefined;
  const kept = existing?.paymentMethod === method ? existing : undefined;
  return {
    farmAccountId: said?.farmAccountId ?? kept?.farmAccountId ?? null,
    reference: said?.reference?.trim() || kept?.reference || null,
  };
};

/** That the named account is this farm's, of the kind the money moved by, and open — unless it was already named. */
const assertTheAccount = async (
  tx: Tx,
  farmId: string,
  farmAccountId: string,
  method: string,
  existing: ExistingMoney
) => {
  const account = await tx.query.farmAccount.findFirst({
    where: { id: farmAccountId, farmId },
    columns: { kind: true, retiredAt: true },
  });
  if (!account) {
    throw refuse("names_no_farm_account", "No such Farm Account");
  }
  if (account.kind !== method) {
    throw refuse(
      "farm_account_not_that_kind",
      "That Farm Account is not the kind the money moved by"
    );
  }
  if (account.retiredAt && farmAccountId !== existing?.farmAccountId) {
    throw refuse("farm_account_retired", "That Farm Account has been retired");
  }
};

/** That the reference is there, and not on another Money Event of the same account. */
const assertTheReference = async (
  tx: Tx,
  farmAccountId: string,
  reference: string | null,
  id: string
): Promise<string> => {
  if (!reference) {
    throw refuse(
      "needs_its_reference",
      "Money by bKash or the bank carries its transaction ID or reference"
    );
  }
  const twice = await tx.query.moneyEvent.findFirst({
    where: { farmAccountId, reference, id: { ne: id } },
    columns: { id: true },
  });
  if (twice) {
    throw refuse(
      "reference_used_already",
      "That transaction ID is on this Farm Account already"
    );
  }
  return reference;
};

/**
 * Which Farm Account a Money Event names, and its transaction ID. Cash names none, nor does a Venture's purse — its
 * account is the Venture Account. bKash or the bank, in the Farm's purse, names one of that kind, not retired, with a
 * reference used on it once — from the day the farm lists any of that kind: before then there is nothing to name, and
 * no start day goes back. A Correction that leaves the method alone keeps what was named.
 */
const farmAccountOf = async (
  tx: Tx,
  booking: Booking,
  money: MoneyOfARecord,
  existing: ExistingMoney,
  purseVentureId: string | null,
  id: string
): Promise<{ farmAccountId: string | null; reference: string | null }> => {
  const method = money.paymentMethod ?? existing?.paymentMethod ?? "cash";
  if (method === "cash" || purseVentureId !== null) {
    return { farmAccountId: null, reference: null };
  }
  const { farmAccountId, reference } = accountAsked(
    booking,
    money,
    existing,
    method
  );
  // Asked for only while one of the kind is open to name: a farm whose only bank account has closed still writes
  // bank money, rather than having every bank payment refused for want of an account it cannot choose.
  const anyOfTheKind = await tx.query.farmAccount.findFirst({
    where: {
      farmId: booking.farm.id,
      kind: method as "bkash" | "bank",
      retiredAt: { isNull: true },
    },
    columns: { id: true },
  });
  if (!(anyOfTheKind || farmAccountId)) {
    return { farmAccountId: null, reference };
  }
  if (!farmAccountId) {
    throw refuse(
      "names_no_farm_account",
      "Money by bKash or the bank names which of the Farm's accounts it went into or came out of"
    );
  }
  await assertTheAccount(tx, booking.farm.id, farmAccountId, method, existing);
  return {
    farmAccountId,
    reference: await assertTheReference(tx, farmAccountId, reference, id),
  };
};

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

/** How a record's money changed hands, or null for a record that booked none. */
export const paymentMethodOf = async (
  tx: Tx,
  farmId: string,
  source: MoneySource,
  sourceId: string
): Promise<PaymentMethod | null> => {
  const money = await moneySnapshotOf(tx, farmId, source, sourceId);
  return money?.paymentMethod ?? null;
};

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
  amountBdt,
  occurredAt: money.occurredAt,
  counterpartyId: money.counterpartyId,
  ...(money.paymentMethod === undefined
    ? {}
    : { paymentMethod: money.paymentMethod }),
  // Left out of a Correction, the purse stays as it was booked: whose money it was is not something a
  // correction to the amount should quietly change.
  ...(money.purseVentureId === undefined
    ? {}
    : { purseVentureId: money.purseVentureId }),
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
  // Nothing to hand back: money waiting for the Owner waits for the evening's post, which reads the Notice itself
  // (the farm's delivery table). Only a kind that goes now has to be carried out of here.
  await tell(
    tx,
    farm.id,
    {
      kind: "money_awaiting_approval",
      // One notice for each time it starts waiting: a corrected Money Event is a new thing to approve.
      about: { id: `${id}:${newId(now)}` },
      facts: {
        moneyEventId: id,
        amountBdt,
        ...(await categoryNamesOf(tx, farm.id, id)),
      },
    },
    now
  );
};

/** The week a bill's pieces are added up over: the farm day of this one and the six before it. */
const PIECES_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;

/**
 * What else the same person was paid by hand in the week up to this entry, by anybody but the Owner, the same way and
 * from the same purse: a bill's other pieces, which the Approval Threshold counts with it. Nothing for money a record
 * books, for money the Owner enters, or for money naming nobody.
 */
const piecesOf = async (
  tx: Tx,
  booking: Booking,
  money: MoneyOfARecord,
  entry: {
    id: string;
    direction: MoneyDirection;
    purseVentureId: string | null;
  }
): Promise<number> => {
  if (
    money.source !== "by_hand" ||
    booking.byTheOwner ||
    money.counterpartyId === null
  ) {
    return 0;
  }
  const pieces = await tx.query.moneyEvent.findMany({
    where: {
      farmId: booking.farm.id,
      source: "by_hand",
      id: { ne: entry.id },
      counterpartyId: money.counterpartyId,
      direction: entry.direction,
      purseVentureId:
        entry.purseVentureId === null ? { isNull: true } : entry.purseVentureId,
      recordedByRole: { ne: "owner" },
      occurredAt: {
        gte: new Date(money.occurredAt.getTime() - PIECES_WINDOW_MS),
        lte: money.occurredAt,
      },
    },
    columns: { amountBdt: true },
  });
  let total = 0;
  for (const one of pieces) {
    total += one.amountBdt;
  }
  return roundTaka(total);
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
  if (byHand?.wageMonth && money.purseVentureId) {
    // A wage is the Farm's, whatever else is true: the Farm provides the labour, which is the whole of
    // what it brings to a Venture. The unique index behind "one wage per person per month" counts the
    // Farm's purse as nothing, so a wage in another purse would slip past it unseen.
    throw new ORPCError("BAD_REQUEST", {
      message: "A wage is the Farm's own, never a Venture's",
      data: { refusal: "wage_is_the_farms" },
    });
  }
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
      purseVentureId: true,
      paymentMethod: true,
      heldBy: true,
      farmAccountId: true,
      reference: true,
    },
  });
  const id = existing?.id ?? byHand?.id ?? newId(now);
  const placed = existing
    ? {
        categoryId: byHand?.category.id ?? existing.categoryId,
        direction: byHand?.category.direction ?? existing.direction,
      }
    : await placedUnder(tx, farm.id, money, byHand, now);
  const terms = {
    amountBdt,
    counterpartyId: money.counterpartyId,
    categoryId: placed.categoryId,
    // Left out of a Correction, the purse stays as it was booked, so the terms are read the same way.
    purseVentureId:
      money.purseVentureId === undefined
        ? (existing?.purseVentureId ?? null)
        : money.purseVentureId,
  };
  const before = existing
    ? {
        terms: {
          amountBdt: existing.amountBdt,
          counterpartyId: existing.counterpartyId,
          categoryId: existing.categoryId,
          purseVentureId: existing.purseVentureId,
        },
        approval: existing.approval,
      }
    : undefined;
  const approval = approvalOf({
    terms,
    thresholdBdt: farm.approvalThresholdBdt,
    enteredByTheOwner: booking.byTheOwner,
    before,
    piecesBdt: await piecesOf(tx, booking, money, {
      id,
      direction: placed.direction,
      purseVentureId: terms.purseVentureId,
    }),
  });
  const fields = {
    ...moneyFieldsOf({ amountBdt, money, approval, byHand }),
    heldBy: handOf(booking, money, existing),
    ...(await farmAccountOf(
      tx,
      booking,
      money,
      existing,
      terms.purseVentureId,
      id
    )),
  };
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

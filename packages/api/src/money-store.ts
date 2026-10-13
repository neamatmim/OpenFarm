import { uuidv7 as newId } from "@OpenFarm/db/ids";
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lt,
  sql,
} from "@OpenFarm/db/operators";
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
  moneyReceipt,
} from "@OpenFarm/db/schema/money";
import type { ApprovedTerms, MoneyApproval } from "@OpenFarm/domain";
import {
  approvalOf,
  farmDayOf,
  roundMoney,
  termsUnchanged,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { ChangeBy, ChangeToWeigh } from "./closed-month-store";
import {
  aboutMoney,
  answerToClosedMonths,
  writesAsTheOwner,
  standsOf,
} from "./closed-month-store";
import { nameTaken } from "./names";
import { tell } from "./notice";
import { refuse } from "./refuse";

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
  venture_made_good: {
    nameBn: "ভেঞ্চারের হারানো পশুর ক্ষতিপূরণ",
    nameEn: "Lost Venture animals made good",
    direction: "out",
  },
  venture_capital_out: {
    nameBn: "ভেঞ্চারে খামারের মূলধন",
    nameEn: "The Farm's capital into a Venture",
    direction: "out",
  },
  venture_capital_back: {
    nameBn: "ভেঞ্চার থেকে খামারের মূলধন ফেরত",
    nameEn: "The Farm's capital back from a Venture",
    direction: "in",
  },
  venture_capital_return: {
    nameBn: "খামারের নিজের মূলধনে মুনাফা",
    nameEn: "The Farm's return on its own capital",
    direction: "in",
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
  // A bKash cash-out fee, a bank's charge: the statement shows it, and with nowhere to write it the Bank Check
  // disagrees by it every month.
  bank_charges: {
    nameBn: "ব্যাংক ও বিকাশের চার্জ",
    nameEn: "Bank and mobile money charges",
    direction: "out",
  },
  // Money that moves the cash and is never the Farm's income or its cost (ADR 0027).
  owner_money_in: {
    nameBn: "মালিকের টাকা খামারে",
    nameEn: "Owner's money in",
    direction: "in",
  },
  owner_drawings: {
    nameBn: "মালিকের তুলে নেওয়া টাকা",
    nameEn: "Owner's drawings",
    direction: "out",
  },
  loan_received: { nameBn: "ঋণ পাওয়া", nameEn: "Loan received", direction: "in" },
  loan_repaid: {
    nameBn: "ঋণের আসল শোধ",
    nameEn: "Loan principal repaid",
    direction: "out",
  },
  machine_bought: {
    nameBn: "যন্ত্র বা ঘর কেনা",
    nameEn: "Machine or building bought",
    direction: "out",
  },
  // What the loan costs: an ordinary cost of running the place, as rent is.
  loan_interest: {
    nameBn: "ঋণের সুদ",
    nameEn: "Loan interest",
    direction: "out",
  },
};

/**
 * The standard Categories whose money moves the cash and is never the Farm's income or its cost (ADR 0027; CONTEXT.md:
 * **Outside the Results**): the Owner's own money in and out, a loan and its principal paid back, and a machine or a
 * building that lasts years. The cash figures count them; no Overhead, Side Result, Cost by Side or income and expense
 * does. A loan's interest is a cost, and is not among them.
 */
export const OUTSIDE_THE_RESULTS: ReadonlySet<CategoryKey> =
  new Set<CategoryKey>([
    "owner_money_in",
    "owner_drawings",
    "loan_received",
    "loan_repaid",
    "machine_bought",
  ]);

/** Whether money under this Category stays out of every result (ADR 0027). */
export const isOutsideTheResults = (key: CategoryKey | null): boolean =>
  key !== null && OUTSIDE_THE_RESULTS.has(key);

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

/** The Farm's Wages Category, which every wage goes under; nothing for a farm whose standard Categories are not in. */
export const wagesCategoryOf = async (
  db: Pick<Tx, "query">,
  farmId: string
): Promise<string | null> => {
  const wages = await db.query.moneyCategory.findFirst({
    where: { farmId, key: "wages" },
    columns: { id: true },
  });
  return wages?.id ?? null;
};

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
  !(category.key !== null && NEVER_THE_ANIMALS.has(category.key)) &&
  // A machine, a loan paid back, the Owner's own money: none is a cost at all, so no animal can carry it (ADR 0027).
  !isOutsideTheResults(category.key);

/**
 * Whether the Owner may mark this Category as paid every month — a **Monthly Cost** — so a month with nothing under it
 * is named. Money going out that no record books: money coming in is nobody's to chase, and a record's money arrives
 * with the record — a Vet's fee among them, though a visiting vet's may be entered by hand, since it comes with a
 * visit and not with the month. Not Wages, which is one Category over many people and is watched by the person instead.
 * Not money outside the results (ADR 0027), which is no cost the month owes: a loan's interest, which is, may be.
 */
export const mayBePaidMonthly = (category: {
  key: CategoryKey | null;
  direction: MoneyDirection;
}): boolean =>
  category.direction === "out" &&
  (category.key === null || !KEPT_BY_RECORDS.has(category.key)) &&
  category.key !== "wages" &&
  !isOutsideTheResults(category.key);

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

/**
 * Whether a Category of the farm's own may be taken up as this standard one: money going the same way, and no mark on
 * it the standard one could not carry — one charged to the animals is a cost in the farm's own use, and stays the farm's.
 */
const mayBeTakenUpAs = (
  key: CategoryKey,
  own: {
    direction: MoneyDirection;
    chargedToAnimals: boolean;
    paidMonthlySince: Date | null;
  }
): boolean => {
  const standard = { key, direction: CATEGORIES[key].direction };
  return (
    own.direction === standard.direction &&
    (!own.chargedToAnimals || mayBeChargedToAnimals(standard)) &&
    (own.paidMonthlySince === null || mayBePaidMonthly(standard))
  );
};

/**
 * Gives the farm these standard Categories. One of the farm's own already going by a standard name, in either language
 * (`nameTaken`), is taken up as the standard one — its money the standard one's from then on, as a farm that kept its
 * loans under its own «ঋণ পাওয়া» before the standard one came would mean — where it can carry what the standard one
 * is (`mayBeTakenUpAs`). One that cannot is left as the farm's.
 */
export const addStandardCategories = async (
  tx: Tx,
  farmId: string,
  keys: readonly CategoryKey[],
  now: Date
): Promise<CategoryKey[]> => {
  if (keys.length === 0) {
    return [];
  }
  const own = await tx.query.moneyCategory.findMany({
    where: { farmId, key: { isNull: true } },
    columns: {
      id: true,
      nameBn: true,
      nameEn: true,
      direction: true,
      chargedToAnimals: true,
      paidMonthlySince: true,
    },
  });
  // Each of the farm's own taken up once, by the first standard one it answers to.
  const takenUp: { key: CategoryKey; id: string }[] = [];
  const toAdd: CategoryKey[] = [];
  for (const key of keys) {
    const twin = own.find(
      (one) =>
        !takenUp.some((taken) => taken.id === one.id) &&
        nameTaken([one], {
          bn: CATEGORIES[key].nameBn,
          en: CATEGORIES[key].nameEn,
        })
    );
    if (twin && mayBeTakenUpAs(key, twin)) {
      takenUp.push({ key, id: twin.id });
    } else {
      toAdd.push(key);
    }
  }
  await Promise.all(
    takenUp.map(({ key, id }) =>
      tx.update(moneyCategory).set({ key }).where(eq(moneyCategory.id, id))
    )
  );
  const added =
    toAdd.length === 0
      ? []
      : await tx
          .insert(moneyCategory)
          .values(
            toAdd.map((key) => ({
              id: newId(now),
              farmId,
              key,
              ...CATEGORIES[key],
              createdAt: now,
            }))
          )
          .onConflictDoNothing()
          .returning({ key: moneyCategory.key });
  return [
    ...takenUp.map((one) => one.key),
    ...added.flatMap((one) => (one.key === null ? [] : [one.key])),
  ];
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
  if (source === "receivable_payment" || source === "supplier_payment") {
    throw new Error(
      "A later payment names the category of its original purchase or sale"
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

/**
 * The Farm's own purse, as a reader asks for it. Every reader of the Farm's money says this and not the
 * shape behind it, so the next reader that forgets is visible as the one that does not say it.
 */
export const THE_FARMS_PURSE = { isNull: true } as const;

/** What a period's money comes to, in and out, and how many entries wait for the Owner's word. */
export interface MoneyTotals {
  inMoney: number;
  outMoney: number;
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
      totalMoney: sql<string>`coalesce(sum(${moneyEvent.amountMoney}), 0)`,
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
    roundMoney(
      Number(rows.find((row) => row.direction === direction)?.totalMoney ?? 0)
    );
  return {
    inMoney: totalOf("in"),
    outMoney: totalOf("out"),
    awaiting: rows.reduce((sum, row) => sum + Number(row.awaiting), 0),
  };
};

/** The money a farm record carries, as that record says it. */
export interface MoneyOfARecord {
  source: MoneySource;
  sourceId: string;
  amountMoney: number;
  occurredAt: Date;
  counterpartyId: string | null;
  /** How it was paid. Left out of a Correction, it stays as it was booked; left out of a first
   *  booking, cash. */
  paymentMethod?: PaymentMethod;
  /** The Side its money falls to, where the record says one: a Wage Draw, as its wage does. */
  side?: (typeof SIDES)[number] | null;
  /** Whose hand the cash went into or came out of, where the record says; left out, the person writing it. */
  heldBy?: string | null;
  /** Whose money moved: left out or null, the Farm's own; a Venture's id, that Venture's. Set by the
   *  record that knows — an Intake of a Venture's Animal, a Sale of one. The Farm's reports read the
   *  Farm's purse alone, so this is what keeps the two from mixing. */
  purseVentureId?: string | null;
  /** The Category it books under, for a record whose own source does not say: a Receivable Payment books under what it paid
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
  /** For a wage, the draws it took off itself: the wage is judged whole against the Approval Threshold, though only
   *  what is paid now is booked. */
  drawsTakenMoney?: number;
}

/** Which Farm Account a record's mobile money or bank money names, and its transaction ID — as the form said it, for the one
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
  farm: { id: string; approvalThresholdMoney: number };
  actorId: string;
  /** The Role the record is written under, which the Money Event is recorded under too. */
  role: RoleName;
  /** Whether the person writing it holds the Owner's Role: the Owner is not asked to approve their
   *  own money. */
  byTheOwner: boolean;
  now: Date;
}

/** Who a booking is, as a **Closed Month** asks of a change to its money. */
export const changeByOfBooking = (booking: Booking): ChangeBy => ({
  farmId: booking.farm.id,
  actorId: booking.actorId,
  byTheOwner: booking.byTheOwner,
  now: booking.now,
});

/** The Roles whose hands the farm's cash passes through: a Vet writing their own fee, or Barn Staff, hold none of it. */
const HOLDS_CASH: ReadonlySet<RoleName> = new Set(["owner", "manager"]);

/**
 * Whose **Cash in Hand** a Money Event names: nobody for mobile money or the bank; the hand the record names, where it names
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
    farm: { id: string; approvalThresholdMoney: number };
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
  byTheOwner: writesAsTheOwner(context.roles),
  now,
  ...(account ? { account } : {}),
});

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

/** A reference as a pattern matching only itself: its own `%`, `_` and `\` are letters, not wildcards. */
const literally = (reference: string): string =>
  reference.replaceAll(/[\\%_]/gu, (letter) => `\\${letter}`);

/** That the reference is there, and not on another Money Event of the same account, whatever its case. */
const assertTheReference = async (
  tx: Tx,
  farmAccountId: string,
  reference: string | null,
  id: string
): Promise<string> => {
  if (!reference) {
    throw refuse(
      "needs_its_reference",
      "Money by mobile money or the bank carries its transaction ID or reference"
    );
  }
  // Matched whatever the case: a transaction ID read off a phone's message is the same one typed in small letters.
  const twice = await tx.query.moneyEvent.findFirst({
    where: {
      farmAccountId,
      reference: { ilike: literally(reference) },
      id: { ne: id },
    },
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
 * account is the Venture Account. Mobile money or the bank, in the Farm's purse, names one of that kind, not retired, with a
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
      kind: method as "mobile_money" | "bank",
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
      "Money by mobile money or the bank names which of the Farm's accounts it went into or came out of"
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
      amountMoney: true,
      paymentMethod: true,
      approval: true,
      approvedBy: true,
      approvedAt: true,
      // Whose hand took the cash, and which of the Farm's numbers took the rest, with its TrxID: what a Correction to
      // either puts right, so the trail keeps it either side.
      heldBy: true,
      farmAccountId: true,
      reference: true,
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
  amountMoney,
  money,
  approval,
  byHand,
}: {
  amountMoney: number;
  money: MoneyOfARecord;
  approval: MoneyApproval;
  byHand: EnteredByHand | undefined;
}) => ({
  amountMoney,
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
  ...(money.side === undefined ? {} : { side: money.side }),
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
    amountMoney,
    approval,
    before,
    terms,
  }: {
    id: string;
    amountMoney: number;
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
        amountMoney,
        ...(await categoryNamesOf(tx, farm.id, id)),
      },
    },
    now
  );
};

/**
 * The terms a Money Event waits for the Owner's word on, as one fingerprint: what it comes to, under which Category, to
 * whom and in whose purse — what a Correction asks her again for. Read with the row she approves from and sent back with
 * her approval, so one put right under her since is refused rather than approved unseen.
 */
export const termsOf = (row: {
  amountMoney: number | string;
  categoryId: string;
  counterpartyId: string | null;
  purseVentureId: string | null;
}): string =>
  [
    Number(row.amountMoney),
    row.categoryId,
    row.counterpartyId ?? "",
    row.purseVentureId ?? "",
  ].join("|");

/** The week a bill's pieces are added up over: the farm day of this one and the six either side of it. */
const PIECES_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;

/** The money a person is paid that is pieces of one bill: what is entered by hand, and their Wage Draws. */
const PIECE_SOURCES = ["by_hand", "wage_draw"] as const;

/**
 * What else the same person was paid by hand — or drew against their wage — within a week of this entry either side,
 * by anybody but the Owner, the same way and from the same purse: a bill's other pieces, which the Approval Threshold
 * counts with it. Either side, because a piece written up late and dated before one already entered is in the same
 * week all the same. Nothing for money another record books, for money the Owner enters, or for money naming nobody.
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
  const isAPiece = PIECE_SOURCES.some((source) => source === money.source);
  if (!isAPiece || booking.byTheOwner || money.counterpartyId === null) {
    return 0;
  }
  const pieces = await tx.query.moneyEvent.findMany({
    where: {
      farmId: booking.farm.id,
      source: { in: [...PIECE_SOURCES] },
      id: { ne: entry.id },
      counterpartyId: money.counterpartyId,
      direction: entry.direction,
      purseVentureId:
        entry.purseVentureId === null ? { isNull: true } : entry.purseVentureId,
      recordedByRole: { ne: "owner" },
      occurredAt: {
        gte: new Date(money.occurredAt.getTime() - PIECES_WINDOW_MS),
        lte: new Date(money.occurredAt.getTime() + PIECES_WINDOW_MS),
      },
    },
    columns: { amountMoney: true },
  });
  let total = 0;
  for (const one of pieces) {
    total += one.amountMoney;
  }
  return roundMoney(total);
};

/**
 * What else is counted with this money against the Approval Threshold. A wage's other pieces are its own draws, whenever
 * they were drawn: a 25,000 wage that took a 6,000 draw is 25,000 paid, and booked as 19,000 it passed under the line
 * unasked. One wage a month, so it has no others. Anything else, the week's other pieces (`piecesOf`).
 */
const otherPiecesOf = async (
  tx: Tx,
  booking: Booking,
  money: MoneyOfARecord,
  byHand: EnteredByHand | undefined,
  entry: Parameters<typeof piecesOf>[3]
): Promise<number> =>
  byHand?.wageMonth
    ? roundMoney(byHand.drawsTakenMoney ?? 0)
    : await piecesOf(tx, booking, money, entry);

/** The Side money stands under once booked: what money entered by hand says, else what the record says, else as it was. */
const sideAfter = (
  money: MoneyOfARecord,
  byHand: EnteredByHand | undefined,
  existing: { side: (typeof SIDES)[number] | null } | undefined
): string | null => {
  if (byHand) {
    return byHand.side ?? null;
  }
  return money.side === undefined ? (existing?.side ?? null) : money.side;
};

/** When money is booked, which way it is paid and under which Side, as a **Closed Month** weighs the booking. */
const howItIsBooked = (
  money: MoneyOfARecord,
  byHand: EnteredByHand | undefined,
  existing:
    | {
        paymentMethod: PaymentMethod;
        side: (typeof SIDES)[number] | null;
      }
    | undefined
) => ({
  occurredAt: money.occurredAt,
  paymentMethod: money.paymentMethod ?? existing?.paymentMethod ?? "cash",
  side: sideAfter(money, byHand, existing),
});

/**
 * Books a record's money as its Money Event, in the record's own transaction: the first time the record
 * is written, a Money Event; every time it is corrected, the same Money Event put right.
 *
 * Over the Approval Threshold, money the Owner did not enter waits for the Owner, who hears about it in
 * the digest; the record itself is never held back (the Owner's decision, 2026-09-13). An approval is of
 * its terms, so a Correction that changes the amount, the Counterparty or the Category asks again, and one
 * that does not keeps it.
 *
 * Money that changes a **Closed Month** is the Owner's alone to book: anybody else is refused (ADR 0028).
 */
export const bookMoney = async (
  tx: Tx,
  booking: Booking,
  money: MoneyOfARecord,
  byHand?: EnteredByHand
): Promise<{ id: string; approval: string }> => {
  const { farm, now } = booking;
  if (byHand?.wageMonth && money.purseVentureId) {
    // A wage is the Farm's, whatever else is true: the Farm provides the labor, which is the whole of
    // what it brings to a Venture. The unique index behind "one wage per person per month" counts the
    // Farm's purse as nothing, so a wage in another purse would slip past it unseen.
    throw new ORPCError("BAD_REQUEST", {
      message: "A wage is the Farm's own, never a Venture's",
      data: { refusal: "wage_is_the_farms" },
    });
  }
  const amountMoney = roundMoney(money.amountMoney);
  const existing = await tx.query.moneyEvent.findFirst({
    where: {
      farmId: farm.id,
      source: money.source,
      sourceId: money.sourceId,
    },
    columns: {
      id: true,
      amountMoney: true,
      approval: true,
      counterpartyId: true,
      categoryId: true,
      direction: true,
      purseVentureId: true,
      paymentMethod: true,
      heldBy: true,
      farmAccountId: true,
      reference: true,
      occurredAt: true,
      side: true,
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
    amountMoney,
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
          amountMoney: existing.amountMoney,
          counterpartyId: existing.counterpartyId,
          categoryId: existing.categoryId,
          purseVentureId: existing.purseVentureId,
        },
        approval: existing.approval,
      }
    : undefined;
  const approval = approvalOf({
    terms,
    thresholdMoney: farm.approvalThresholdMoney,
    enteredByTheOwner: booking.byTheOwner,
    before,
    piecesMoney: await otherPiecesOf(tx, booking, money, byHand, {
      id,
      direction: placed.direction,
      purseVentureId: terms.purseVentureId,
    }),
  });
  const heldBy = handOf(booking, money, existing);
  const account = await farmAccountOf(
    tx,
    booking,
    money,
    existing,
    terms.purseVentureId,
    id
  );
  // A Closed Month's money is the Owner's alone to change, and what she changes is kept for the next paper (ADR 0028).
  await answerToClosedMonths(tx, changeByOfBooking(booking), [
    {
      recordId: id,
      source: money.source,
      before: existing ? standsOf(existing) : undefined,
      after: standsOf({
        ...terms,
        ...howItIsBooked(money, byHand, existing),
        heldBy,
        farmAccountId: account.farmAccountId,
      }),
      about: aboutMoney(farm.id, money),
    },
  ]);
  const fields = {
    ...moneyFieldsOf({ amountMoney, money, approval, byHand }),
    awaitingInPieces:
      approval === "awaiting" &&
      terms.amountMoney <= farm.approvalThresholdMoney,
    heldBy,
    ...account,
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
  await tellTheOwner(tx, booking, { id, amountMoney, approval, before, terms });
  return { id, approval };
};

/** What a record's money may be put right in place: the few columns a record's own Correction carries over. */
export interface MoneyPutRight {
  amountMoney?: number;
  occurredAt?: Date;
  purseVentureId?: string | null;
  reference?: string | null;
}

/**
 * Puts a record's Money Events right in place — a Vet's fee, an Internal Sale, a Venture's movement, an outing paid from
 * its Float — where the record carries a column or two over rather than booking its money afresh (`bookMoney`). The one
 * other way the Farm's money changes, so it answers to a **Closed Month** the same way (ADR 0028).
 */
export const putMoneyRight = async (
  tx: Tx,
  by: ChangeBy,
  /** A record's Money Events, by the record; or the one Money Event named. */
  of: { source?: MoneySource; sourceId: string } | { id: string },
  change: MoneyPutRight
): Promise<void> => {
  const rows = await tx.query.moneyEvent.findMany({
    where: {
      farmId: by.farmId,
      ...("id" in of
        ? { id: of.id }
        : {
            sourceId: of.sourceId,
            ...(of.source === undefined ? {} : { source: of.source }),
          }),
    },
    columns: {
      id: true,
      source: true,
      sourceId: true,
      amountMoney: true,
      occurredAt: true,
      purseVentureId: true,
      categoryId: true,
      counterpartyId: true,
      heldBy: true,
      farmAccountId: true,
      paymentMethod: true,
      side: true,
    },
  });
  await answerToClosedMonths(
    tx,
    by,
    rows.map((row) => ({
      recordId: row.id,
      source: row.source,
      before: standsOf(row),
      after: standsOf({ ...row, ...change }),
      about: aboutMoney(by.farmId, row),
    }))
  );
  if (rows.length > 0) {
    await tx
      .update(moneyEvent)
      .set(change)
      .where(
        inArray(
          moneyEvent.id,
          rows.map((row) => row.id)
        )
      );
  }
};

/**
 * Takes Money Events off the books — a record voided, never spent or written twice — with their receipts. One of the
 * Farm's own in a **Closed Month** is the Owner's alone to take off, and is kept for the next month's paper; the months
 * of them all are asked about at once.
 */
export const takeOffTheBooks = async (
  tx: Tx,
  by: ChangeBy,
  ids: readonly string[]
): Promise<void> => {
  if (ids.length === 0) {
    return;
  }
  const events = await tx.query.moneyEvent.findMany({
    where: { farmId: by.farmId, id: { in: [...ids] } },
    columns: {
      id: true,
      source: true,
      sourceId: true,
      occurredAt: true,
      amountMoney: true,
      purseVentureId: true,
      categoryId: true,
      counterpartyId: true,
    },
  });
  await answerToClosedMonths(
    tx,
    by,
    events.map((one): ChangeToWeigh => ({
      recordId: one.id,
      source: one.source,
      before: standsOf(one),
      after: undefined,
      about: aboutMoney(by.farmId, one),
    }))
  );
  await tx.delete(moneyReceipt).where(inArray(moneyReceipt.moneyEventId, ids));
  await tx.delete(moneyEvent).where(inArray(moneyEvent.id, ids));
};

/**
 * The Owner's word on money waiting for her: approved, by her and now — only while it still waits at the amount she
 * read, so a correction or another approval landing between her read and this write changes nothing. Writes who
 * approved and when, never a figure. Says whether it was still waiting.
 */
export const approveMoney = async (
  tx: Tx,
  by: ChangeBy,
  waiting: { id: string; amountMoney: number }
): Promise<boolean> => {
  const approved = await tx
    .update(moneyEvent)
    .set({ approval: "approved", approvedBy: by.actorId, approvedAt: by.now })
    .where(
      and(
        eq(moneyEvent.id, waiting.id),
        eq(moneyEvent.farmId, by.farmId),
        eq(moneyEvent.approval, "awaiting"),
        eq(moneyEvent.amountMoney, waiting.amountMoney)
      )
    )
    .returning({ id: moneyEvent.id });
  return approved.length > 0;
};

/** All the money waiting for the Owner's word, every purse, counted and totaled on the farm — whichever way each
 *  goes — however many of them a queue lists. */
export const awaitingApproval = async (
  db: Pick<Tx, "select">,
  farmId: string
): Promise<{
  count: number;
  totalMoney: number;
  /** The farm day of the Farm's own oldest entry waiting — where the money page opens to find every one of them — or
   *  nothing where none of the Farm's own waits (a Venture's waits on its own page). */
  farmsOldestOn: string | null;
}> => {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalMoney: sql<string>`coalesce(sum(${moneyEvent.amountMoney}), 0)`,
      farmsOldestAt: sql<Date | null>`min(${moneyEvent.occurredAt}) filter (where ${moneyEvent.purseVentureId} is null)`,
    })
    .from(moneyEvent)
    .where(
      and(eq(moneyEvent.farmId, farmId), eq(moneyEvent.approval, "awaiting"))
    );
  const oldest = row?.farmsOldestAt ? new Date(row.farmsOldestAt) : null;
  return {
    count: Number(row?.count ?? 0),
    totalMoney: roundMoney(Number(row?.totalMoney ?? 0)),
    farmsOldestOn: oldest ? farmDayOf(oldest) : null,
  };
};

/**
 * Takes a voided record's money off the books: its Money Events and their receipts. A void is a record that should
 * never have been written — entered twice, or never spent — so its money is gone with it rather than set to nothing. A
 * **Closed Month**'s is the Owner's alone to take off (`takeOffTheBooks`).
 */
export const forgetTheMoneyOf = async (
  tx: Tx,
  by: ChangeBy,
  source: MoneySource,
  sourceId: string
): Promise<void> => {
  const events = await tx.query.moneyEvent.findMany({
    where: { source, sourceId },
    columns: { id: true },
  });
  await takeOffTheBooks(
    tx,
    by,
    events.map((one) => one.id)
  );
};

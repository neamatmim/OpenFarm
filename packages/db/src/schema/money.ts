import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";
import { counterparty } from "./fattening";
import { drugProduct } from "./health";
import { SIDES, animal } from "./herd";
import { numericMoney } from "./numeric-columns";
import { buyingTrip } from "./trip";
import { venture } from "./venture";

/** Which way money went: into the farm, or out of it. */
export const MONEY_DIRECTIONS = ["in", "out"] as const;
export type MoneyDirection = (typeof MONEY_DIRECTIONS)[number];

/** How money changed hands. Cash at the gate, mobile money on a phone, or through a bank. */
export const PAYMENT_METHODS = ["cash", "mobile_money", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * The farm records that make money on their own. A Money Event made by one of these names it, and one
 * record makes one Money Event: a Correction to the record corrects its money rather than adding more.
 */
export const RECORD_SOURCES = [
  "dispatch",
  "intake",
  "buying_trip",
  "selling_trip",
  "sale",
  // What a broker took for one Sale: money of its own, out, beside the Sale's money in.
  "sale_broker",
  // A Wage Draw: a person's money ahead of payday, booked under Wages so the month's wage cost stays whole.
  "wage_draw",
  "feed_in",
  "medicine_purchase",
  "vet_fee",
  // The Farm's own side of an Internal Sale. Two sources rather than one, because the same act is money
  // in when the Farm lets an animal go and money out when it takes one on, and a source carries one
  // Category with one direction.
  "internal_sale_in",
  "internal_sale_out",
  // What a Venture repaid the Farm for what its Animals consumed of what the Farm bought.
  "reimbursement",
  // A supplementary payout on a Settlement Adjustment. The Farm's own money: the Venture Account closed
  // when the Settlement was paid, and news landing after that is the Farm's to make good.
  "settlement_adjustment",
  // What the Farm earned for managing a Venture, taken out of its account at Settlement. The one part
  // of a Settlement that is the Farm's income — an Investor's payout is his own capital and profit
  // going home, and is never the Farm's.
  "farm_share",
  // The Farm's share of a Venture's loss, paid into its account at Settlement: the mirror of `farm_share`,
  // and money out of the Farm's own books, because it is the Farm carrying its part of a run that lost.
  "farm_loss",
  // What the Farm paid a Venture to make good one of its animals written off as lost: the Farm's own money out.
  "venture_made_good",
  // The Farm's own capital in a Venture: out of its books for its Units, back at Settlement or on a call-off, and its
  // share of the profit on that capital as its income.
  "venture_capital_out",
  "venture_capital_back",
  "venture_capital_return",
] as const;
export type RecordSource = (typeof RECORD_SOURCES)[number];

/** Where a Money Event came from: one of the records, a buyer paying his Receivable, or entered by hand by the Manager —
 *  wages, and everything no record catches, where the Money Event is the whole of it.
 *
 *  A Receivable Payment is a record that makes money, but not one of `RECORD_SOURCES`: those each carry a Category of their
 *  own, and a Receivable Payment books under the Category of what it paid for — milk sales or cattle sales — so a report's
 *  totals by Category stay what they were. */
export const MONEY_SOURCES = [
  ...RECORD_SOURCES,
  "receivable_payment",
  "supplier_payment",
  "by_hand",
] as const;
export type MoneySource = (typeof MONEY_SOURCES)[number];

/**
 * The standard Categories every farm starts with: one for each record that makes money, and the ones a
 * dairy farm's month is otherwise made of. Keyed, so the records and the wage rule can find them; the
 * farm's own Categories carry no key.
 */
export const CATEGORY_KEYS = [
  ...RECORD_SOURCES,
  "wages",
  "rent",
  "utilities",
  "repairs",
  "hygiene",
  "equipment",
  "transport",
  "manure_sales",
  "bank_charges",
  // Money that moves the cash and is never income or cost (ADR 0027), and the interest a loan costs, which is.
  "owner_money_in",
  "owner_drawings",
  "loan_received",
  "loan_repaid",
  "machine_bought",
  "loan_interest",
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/**
 * Where a Money Event stands with the Owner. Under the Approval Threshold it needs nobody; over it, it
 * waits until the Owner approves it. The record that made it is never held back — only the money is
 * (the Owner's decision, 2026-09-13).
 */
export const MONEY_APPROVALS = ["not_needed", "awaiting", "approved"] as const;
export type MoneyApproval = (typeof MONEY_APPROVALS)[number];

/**
 * A Category a Money Event falls under. The standard ones carry a key; the farm's own carry none. Retired,
 * never removed.
 */
export const moneyCategory = pgTable(
  "money_category",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Which standard Category this is; null for one the farm added. */
    key: text("key", { enum: CATEGORY_KEYS }),
    nameBn: text("name_bn").notNull(),
    nameEn: text("name_en"),
    direction: text("direction", { enum: MONEY_DIRECTIONS }).notNull(),
    /** Whether money entered by hand under this Category is charged to the animals of its Side, split by
     *  the days each stood on the farm that month: a Vet visit that named nobody, lab tests, fly spray.
     *  The Owner's mark. Wages, shed rent, utilities, repairs and shed hygiene are never marked — they are the place
     *  and the people, and they stay the Farm's. */
    chargedToAnimals: boolean("charged_to_animals").notNull().default(false),
    /** Since when the Owner has marked it as paid every month — a **Monthly Cost** — so that a month with nothing
     *  entered under it is named. Null while it is not; a month before this one is never named. */
    paidMonthlySince: timestamp("paid_monthly_since", { withTimezone: true }),
    /** Retired, never removed: a Money Event entered under it last year still names it. */
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("money_category_key_uidx").on(table.farmId, table.key),
    uniqueIndex("money_category_name_uidx").on(table.farmId, table.nameBn),
  ]
);

/** What a Farm Account is: a mobile money number, or an account at a bank. */
export const FARM_ACCOUNT_KINDS = ["mobile_money", "bank"] as const;
export type FarmAccountKind = (typeof FARM_ACCOUNT_KINDS)[number];

/**
 * A **Farm Account**: one of the Farm's own mobile money numbers or bank accounts, where its money by mobile money or the bank goes in
 * and comes out — the pair of the Venture Account, which is the Investors'. The Owner's to list; retired, never removed,
 * since money booked last year still names it.
 */
export const farmAccount = pgTable(
  "farm_account",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: FARM_ACCOUNT_KINDS }).notNull(),
    /** What the farm calls it: "অফিস বিকাশ", "সোনালী ব্যাংক চলতি". */
    name: text("name").notNull(),
    /** The mobile money number, or the bank account's number. */
    number: text("number").notNull(),
    /** A bank account's bank and branch; nothing for mobile money. */
    bank: text("bank"),
    branch: text("branch"),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("farm_account_number_uidx").on(
      table.farmId,
      table.kind,
      table.number
    ),
  ]
);

/**
 * One month's reading of a Farm Account's statement — the bank's or mobile money's — against what the farm believed it held at
 * that month's end: the **Bank Check** of the Farm's own money, the pair of `venture_bank_check`. Its first reading is
 * what the account held from then on; every month after is the farm's books against the statement.
 */
export const farmAccountCheck = pgTable(
  "farm_account_check",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    farmAccountId: text("farm_account_id")
      .notNull()
      .references(() => farmAccount.id),
    /** The month it is of, "YYYY-MM". One reading per account per month. */
    forMonth: text("for_month").notNull(),
    /** What the statement said, and what the farm thought at the moment she read it. */
    readMoney: numericMoney("read_money").notNull(),
    expectedMoney: numericMoney("expected_money").notNull(),
    /** What she found out about a difference, where she has found out anything. */
    note: text("note"),
    checkedBy: text("checked_by").references(() => user.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "farm_account_check_month",
      sql`${table.forMonth} ~ '^[0-9]{4}-[0-9]{2}$'`
    ),
    uniqueIndex("farm_account_check_uidx").on(
      table.farmAccountId,
      table.forMonth
    ),
  ]
);

/**
 * One flow of money in or out of the Farm: how much, when, which way, under what Category, with whom, how
 * it was paid, and the record that caused it.
 *
 * Not a ledger: an income and expense record the accountant keeps the books from.
 */
export const moneyEvent = pgTable(
  "money_event",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: MONEY_DIRECTIONS }).notNull(),
    amountMoney: numericMoney("amount_money").notNull(),
    /** When the money moved, as the record that caused it says. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => moneyCategory.id),
    counterpartyId: text("counterparty_id").references(() => counterparty.id),
    paymentMethod: text("payment_method", { enum: PAYMENT_METHODS }).notNull(),
    /** The record that made it, and that record's id. */
    source: text("source", { enum: MONEY_SOURCES }).notNull(),
    sourceId: text("source_id").notNull(),
    /** What the Manager wrote about money entered by hand. */
    note: text("note"),
    /** The month a wage pays for, "YYYY-MM". One wage per person per month. */
    wageMonth: text("wage_month"),
    /** The Side money entered by hand belongs to, when it belongs to one; null for the whole farm. */
    side: text("side", { enum: SIDES }),
    /** The **Purse** whose money this was: null for the Farm's own, or the Venture it belonged to. The
     *  Farm's reports read the Farm's purse alone, so money that was never the Farm's is never counted
     *  as its income or its cost. Everything recorded before Ventures existed is the Farm's. */
    purseVentureId: text("purse_venture_id").references(() => venture.id),
    approval: text("approval", { enum: MONEY_APPROVALS }).notNull(),
    /** Waiting under the Approval Threshold on its own, because the week's other pieces to the same person took it
     *  past the line in force when it was written. Kept, because a line moved since cannot say why it waits. */
    awaitingInPieces: boolean("awaiting_in_pieces").notNull().default(false),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    /** Whose **Cash in Hand** the notes went into, or came out of: only for cash, and only for money booked since the
     *  farm began saying so — an older one, or one by mobile money or the bank, names nobody. */
    heldBy: text("held_by").references(() => user.id),
    /** The Farm Account mobile money or bank money went into or came out of, and its transaction ID or reference: only the
     *  Farm's own purse, only since the farm listed its accounts. Cash names none. */
    farmAccountId: text("farm_account_id").references(() => farmAccount.id),
    reference: text("reference"),
  },
  (table) => [
    check(
      "money_event_wage_month",
      sql`${table.wageMonth} is null or ${table.wageMonth} ~ '^[0-9]{4}-[0-9]{2}$'`
    ),
    uniqueIndex("money_event_source_uidx").on(table.source, table.sourceId),
    // A transaction ID is one payment: twice on one Farm Account is a payment written twice. NULLs never collide.
    uniqueIndex("money_event_reference_uidx").on(
      table.farmAccountId,
      table.reference
    ),
    index("money_event_held_idx").on(table.farmId, table.heldBy),
    index("money_event_day_idx").on(table.farmId, table.occurredAt),
    index("money_event_approval_idx").on(table.farmId, table.approval),
    // One wage per person per month. Entries that are not wages carry no month, and do not collide.
    //
    // The Purse is deliberately not in here. Postgres counts NULLs as distinct, and the Farm's purse is
    // NULL, so adding it would stop the Farm's own wages colliding at all — the one thing this index is
    // for. A wage is the Farm's anyway: the Farm provides the labor, which is the whole of what it
    // brings to a Venture.
    uniqueIndex("money_event_wage_uidx").on(
      table.farmId,
      table.counterpartyId,
      table.wageMonth
    ),
  ]
);

/**
 * A **Handover**: cash passed from one hand to another — the Manager's takings to the Owner, the Owner's cash to the
 * Manager for the week — or into the bank as the Farm's deposit, or out of it into a hand. Not a Money Event: the
 * Farm's money has not come or gone, only moved between the people and the place that hold it. One end is always a
 * person; nothing moves from the bank to the bank.
 */
export const handover = pgTable(
  "handover",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Whose hand it left; nothing for cash drawn out of the bank. */
    fromUserId: text("from_user_id").references(() => user.id),
    /** Whose hand it went into; nothing for cash deposited in the bank. */
    toUserId: text("to_user_id").references(() => user.id),
    amountMoney: numericMoney("amount_money").notNull(),
    handedAt: timestamp("handed_at", { withTimezone: true }).notNull(),
    /** The deposit slip or the check, where the bank is one end. */
    reference: text("reference"),
    note: text("note"),
    /** The Farm's own Buying Trip this cash was for: its **Buying Float** handed out before the livestock market, or the cash
     *  brought back when it was counted home. Nothing for cash passed for any other reason. */
    buyingTripId: text("buying_trip_id").references(() => buyingTrip.id),
    float: text("float", { enum: ["out", "back"] }),
    /** The Venture Account a deposit went into: a Venture's sale cash, held in a hand since the livestock market, banked with its
     *  slip. Nothing for the Farm's own cash. */
    ventureId: text("venture_id").references(() => venture.id),
    /** The Farm Account at either bank end: cash deposited into it, drawn out of it, or mobile money moved to the bank. */
    fromAccountId: text("from_account_id").references(() => farmAccount.id),
    toAccountId: text("to_account_id").references(() => farmAccount.id),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("handover_farm_idx").on(table.farmId, table.handedAt)]
);

/**
 * A **Wage Draw**: money a person takes ahead of payday, owed back out of their wage. Its money went out the day it was
 * drawn, as a Money Event under Wages; payday takes the draws still open off the month's wage, the oldest first, and pays
 * the rest. A draw bigger than the wage stays open for what was not taken.
 */
export const wageDraw = pgTable(
  "wage_draw",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Whose wage it comes off: the person, as their wage names them. */
    counterpartyId: text("counterparty_id")
      .notNull()
      .references(() => counterparty.id),
    amountMoney: numericMoney("amount_money").notNull(),
    drawnAt: timestamp("drawn_at", { withTimezone: true }).notNull(),
    note: text("note"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("wage_draw_person_idx").on(table.farmId, table.counterpartyId),
  ]
);

/** What one wage took off one Wage Draw at payday. A wage may take several draws; a draw may be taken by two wages. */
export const wageDrawTaken = pgTable(
  "wage_draw_taken",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    drawId: text("draw_id")
      .notNull()
      .references(() => wageDraw.id),
    /** The wage's Money Event that took it. */
    wageEventId: text("wage_event_id")
      .notNull()
      .references(() => moneyEvent.id),
    amount: numericMoney("amount").notNull(),
  },
  (table) => [
    index("wage_draw_taken_draw_idx").on(table.drawId),
    index("wage_draw_taken_wage_idx").on(table.wageEventId),
  ]
);

/** The photo of a Money Event's receipt, when somebody took one. One per Money Event. */
export const moneyReceipt = pgTable("money_receipt", {
  moneyEventId: text("money_event_id")
    .primaryKey()
    .references(() => moneyEvent.id),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  /** Downscaled on the device before upload, base64. */
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * Medicine bought for the Drug List: which product, how much of it in the words on the box, what it
 * cost, who sold it, and roughly how many doses it holds — which is what a dose given is costed from
 * (the Owner's decision, 2026-09-13).
 */
export const medicinePurchase = pgTable(
  "medicine_purchase",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    drugProductId: text("drug_product_id")
      .notNull()
      .references(() => drugProduct.id),
    /** How much, as the box or the shop says it: "10 vials", "500 ml". */
    quantity: text("quantity").notNull(),
    doses: integer("doses").notNull(),
    priceMoney: numericMoney("price_money").notNull(),
    counterpartyId: text("counterparty_id")
      .notNull()
      .references(() => counterparty.id),
    /** The farm's day it was bought. */
    purchasedOn: timestamp("purchased_on", { withTimezone: true }).notNull(),
    /** The Lot Number printed on the box, which traces a dose back to what was in it. Null for medicine
     *  written down before the farm asked. */
    lotNumber: text("lot_number"),
    /** The last day the box says it may be used, as the farm's own day ("2039-08-31"). What the store is
     *  warned about, and what a dose given after it is said of. */
    expiresOn: text("expires_on"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("medicine_purchase_product_idx").on(
      table.farmId,
      table.drugProductId,
      table.purchasedOn
    ),
  ]
);

/**
 * The Vet's own fee for a visit, entered by the Vet: how much, the day, and the animals seen when the
 * Vet names them — which is what the fee is charged to.
 */
export const vetFee = pgTable(
  "vet_fee",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    vetId: text("vet_id")
      .notNull()
      .references(() => user.id),
    amountMoney: numericMoney("amount_money").notNull(),
    /** The farm's day of the visit. */
    visitedOn: timestamp("visited_on", { withTimezone: true }).notNull(),
    note: text("note"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("vet_fee_vet_idx").on(table.farmId, table.vetId)]
);

/** An animal the Vet saw on a visit they charged for. */
export const vetFeeAnimal = pgTable(
  "vet_fee_animal",
  {
    vetFeeId: text("vet_fee_id")
      .notNull()
      .references(() => vetFee.id),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id),
  },
  (table) => [primaryKey({ columns: [table.vetFeeId, table.animalId] })]
);

/** What a buyer's **Receivable** is for, and so which Category his payment books under. */
export const RECEIVABLE_KINDS = ["cattle", "milk"] as const;

/**
 * One handover of money from a buyer towards his **Receivable**, for his cattle or for his milk: its own Money Event on the
 * day it came. Which Sales or Dispatches it cleared is worked out when it is read — oldest first — and never stored,
 * so a Correction to an old Sale re-flows without rewriting what a payment was for.
 */
export const receivablePayment = pgTable(
  "receivable_payment",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    counterpartyId: text("counterparty_id")
      .notNull()
      .references(() => counterparty.id),
    kind: text("kind", { enum: RECEIVABLE_KINDS }).notNull(),
    amountMoney: numericMoney("amount_money").notNull(),
    /** The farm day ("YYYY-MM-DD") the money came. */
    paidOn: text("paid_on").notNull(),
    /** What the Manager wrote beside it: always, when he paid more than he owed. */
    note: text("note"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("receivable_payment_buyer_idx").on(
      table.farmId,
      table.counterpartyId,
      table.kind
    ),
  ]
);

/** What a **Write-off** closes: a Sale's Receivable or a Dispatch's. */
export const RECEIVABLE_SOURCES = ["sale", "dispatch"] as const;

/**
 * The Owner closing a **Receivable** that will not be paid, with a reason: so much of one Sale's or one Dispatch's. What the
 * animal fetched — or the milk — is then its price less it, wherever a figure asks. A buyer who pays after all puts it
 * back: a payment beyond everything open goes to what was written off, oldest first. The Owner's alone.
 */
export const receivableWriteOff = pgTable(
  "receivable_write_off",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    source: text("source", { enum: RECEIVABLE_SOURCES }).notNull(),
    /** The Sale or the Dispatch it closes. */
    sourceId: text("source_id").notNull(),
    counterpartyId: text("counterparty_id")
      .notNull()
      .references(() => counterparty.id),
    amountMoney: numericMoney("amount_money").notNull(),
    reason: text("reason").notNull(),
    /** The farm day ("YYYY-MM-DD") the Owner wrote it off. */
    writtenOn: text("written_on").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("receivable_write_off_source_idx").on(
      table.farmId,
      table.source,
      table.sourceId
    ),
  ]
);

/**
 * A **Closed Month** of the Farm's own money: the Owner said its figures were done. Only she may change its money
 * afterwards, and what she changes is told on the next month's paper. Reopened with a reason, it is open again; closed
 * again, the same row says so.
 */
export const closedMonth = pgTable(
  "closed_month",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** The month closed, "YYYY-MM". */
    month: text("month").notNull(),
    closedBy: text("closed_by").references(() => user.id),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
    /** Set while it stands reopened: who, when and why. */
    reopenedBy: text("reopened_by").references(() => user.id),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    reopenReason: text("reopen_reason"),
  },
  (table) => [
    check("closed_month_month", sql`${table.month} ~ '^[0-9]{4}-[0-9]{2}$'`),
    uniqueIndex("closed_month_uidx").on(table.farmId, table.month),
  ]
);

/** What a change to a **Closed Month**'s money did. */
export const CLOSED_MONTH_CHANGES = [
  "entered",
  "corrected",
  "moved",
  "voided",
] as const;
export type ClosedMonthChangeKind = (typeof CLOSED_MONTH_CHANGES)[number];

/**
 * What a change to a **Closed Month** was made to: a Money Event, by the record its money came from, or one of the
 * other records the month's figures read — a Handover between hands, a Receivable Write-off, a Cash Count, a Bank
 * Check.
 */
export const CLOSED_MONTH_SOURCES = [
  ...MONEY_SOURCES,
  "handover",
  "receivable_write_off",
  "cash_count",
  "bank_check",
] as const;
export type ClosedMonthSource = (typeof CLOSED_MONTH_SOURCES)[number];

/**
 * One change the Owner made to a **Closed Month**'s figures after it was closed — an entry, a Correction, a move into or
 * out of it, a void — kept so the next month's paper can say what changed under a month already done, and to what.
 */
export const closedMonthChange = pgTable(
  "closed_month_change",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** The closed month whose money changed: where it stood, or where it was moved to. */
    month: text("month").notNull(),
    /** The Money Event, Handover, Write-off, Cash Count or Bank Check changed: named by its id alone, as a void takes
     *  it away. */
    recordId: text("record_id").notNull(),
    source: text("source", { enum: CLOSED_MONTH_SOURCES }).notNull(),
    /** Whom it was with or about, as named when it changed: the Counterparty, the buyer, the person handed to. */
    about: text("about"),
    /** The tag of the Animal it was for, where it was one animal's. */
    tagNumber: text("tag_number"),
    change: text("change", { enum: CLOSED_MONTH_CHANGES }).notNull(),
    /** What the closed month held of it before, and after: nothing before for one entered or moved in, nothing after
     *  for one voided or moved out. Signed, as a Bank Check reads an overdrawn account. */
    beforeMoney: numericMoney("before_money"),
    afterMoney: numericMoney("after_money"),
    changedBy: text("changed_by").references(() => user.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "closed_month_change_month",
      sql`${table.month} ~ '^[0-9]{4}-[0-9]{2}$'`
    ),
    index("closed_month_change_at_idx").on(table.farmId, table.changedAt),
  ]
);

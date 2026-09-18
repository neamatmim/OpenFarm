import { sql } from "drizzle-orm";
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";
import { buyingTrip } from "./trip";

/**
 * Where a Venture is in its life. Open while the Agreements are signed and the capital arrives; Buying once
 * the Owner says the Floor is met; Fattening when they are all bought; Selling from its first Sale; Settled
 * when the last payout is made. Cancelled is where an under-funded one ends, with every taka refunded.
 */
export const VENTURE_STATES = [
  "open",
  "buying",
  "fattening",
  "selling",
  "settled",
  "cancelled",
] as const;
export type VentureState = (typeof VENTURE_STATES)[number];

/**
 * One investor-funded run of fattening cattle, from the first Investment Agreement to the last payout.
 *
 * It carries the plan it opened on and nothing it has since done: what it holds, what it has spent and what
 * it has paid out are read from the movements of its own money, never stored here.
 */
export const venture = pgTable(
  "venture",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    state: text("state", { enum: VENTURE_STATES }).notNull().default("open"),
    /** What the Owner is looking to raise, and the least it is worth starting on. */
    targetCapitalBdt: numeric("target_capital_bdt", {
      precision: 12,
      scale: 2,
    }).notNull(),
    floorBdt: numeric("floor_bdt", { precision: 12, scale: 2 }).notNull(),
    /** The day the Floor must be met by, as a calendar names it. */
    decideBy: text("decide_by").notNull(),
    /** The period the Venture means to sell in; its Animals inherit it. */
    targetWindowStart: text("target_window_start").notNull(),
    targetWindowEnd: text("target_window_end").notNull(),
    /** What one Unit costs, and how many there are. An Investor holds whole Units. */
    unitPriceBdt: numeric("unit_price_bdt", {
      precision: 12,
      scale: 2,
    }).notNull(),
    units: integer("units").notNull(),
    /** The part of the capital meant for buying animals; the rest is the Running Budget. */
    cattleBudgetBdt: numeric("cattle_budget_bdt", {
      precision: 12,
      scale: 2,
    }).notNull(),
    /** Why a Venture was called off, in the Owner's words. */
    cancelledReason: text("cancelled_reason"),
    openedBy: text("opened_by").references(() => user.id),
    openedByRole: text("opened_by_role", { enum: ROLES }).notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("venture_state_idx").on(table.farmId, table.state)]
);

/**
 * Somebody whose money is in a Venture: known to the Owner personally or personally introduced, resident
 * here, and one of at most twenty at a time, the Owner among them.
 *
 * Not a **Counterparty**, who is paid for something. An Investor shares what the Farm makes, and so needs
 * what paying them and their family needs: a bank account, and a nominee.
 */
export const investor = pgTable(
  "investor",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    address: text("address"),
    /** The number on their National ID, as the agreement and the tax man ask for it. */
    nid: text("nid"),
    /** Where their money goes: bank channels only, so the account is the way to pay them. */
    bankAccount: text("bank_account"),
    nomineeName: text("nominee_name"),
    nomineePhone: text("nominee_phone"),
    nomineeRelation: text("nominee_relation"),
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    // A name is not an identity in Bangladesh — two Md. Abdul Karims are two people, and the farm may
    // record both. The same name on the same phone is the same person written down twice, and that the
    // farm will not have.
    uniqueIndex("investor_person_uidx").on(
      table.farmId,
      table.name,
      table.phone
    ),
  ]
);

/**
 * What one Investor signed for one Venture: the Units they took, the percentages the profit is split by,
 * and the Arbitrator both sides named before there was anything to argue about.
 *
 * The stamped paper itself is a photo kept beside it. No capital may be taken against an Agreement that
 * has none.
 */
export const investmentAgreement = pgTable(
  "investment_agreement",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    ventureId: text("venture_id")
      .notNull()
      .references(() => venture.id, { onDelete: "cascade" }),
    investorId: text("investor_id")
      .notNull()
      .references(() => investor.id),
    /** Whole Units. Everything an Investor is owed divides by these. */
    units: integer("units").notNull(),
    /** The split, frozen at signing: what the Investors take of the profit, and what the Farm takes. */
    investorsPercent: integer("investors_percent").notNull(),
    /** The Target Window as this paper says it: copied from the Venture at signing and never moved
     *  afterwards, because what an Investor agreed to is what their own paper reads. */
    targetWindowStart: text("target_window_start").notNull(),
    targetWindowEnd: text("target_window_end").notNull(),
    /** The person both sides named to decide whether the Farm was negligent. */
    arbitrator: text("arbitrator").notNull(),
    /** The stamped instrument: what the stamp cost, the day it was stamped, and its serial. */
    stampValueBdt: numeric("stamp_value_bdt", {
      precision: 12,
      scale: 2,
    }).notNull(),
    stampedOn: text("stamped_on").notNull(),
    stampSerial: text("stamp_serial").notNull(),
    signedBy: text("signed_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("investment_agreement_uidx").on(
      table.ventureId,
      table.investorId
    ),
  ]
);

/** The photo of a stamped Investment Agreement. One per Agreement, kept as the Farm's proof of it. */
export const agreementPaper = pgTable("agreement_paper", {
  agreementId: text("agreement_id")
    .primaryKey()
    .references(() => investmentAgreement.id, { onDelete: "cascade" }),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  /** Downscaled on the device before upload, base64. */
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

/**
 * What a Venture Movement is for: capital in, the refund that undoes it, the Buying Float drawn for one
 * trip to the haat, the cash that Float brings home, the two sides of an **Internal Sale** — a Venture
 * paying for an Animal it takes on, and being paid for one it lets go — and the monthly
 * **Reimbursement** of what its Animals consumed of what the Farm bought, and the Owner's **Advance**
 * when the Running Budget has run out. The payout joins them as its own work arrives.
 */
export const VENTURE_MOVEMENT_KINDS = [
  "capital_in",
  "refund",
  "float_out",
  "float_back",
  "internal_buy",
  "internal_sell",
  "sale_in",
  "reimbursement",
  "advance",
] as const;
export type VentureMovementKind = (typeof VENTURE_MOVEMENT_KINDS)[number];

/**
 * One movement of a Venture's own money through its Venture Account: capital arriving against an
 * Agreement, the refund that sends it back when the Venture is called off, the Buying Float and what
 * comes home from it, either side of an Internal Sale, a month's Reimbursement, the Owner's Advance,
 * and what a buyer paid for one of its Animals.
 *
 * Never a **Money Event**. A Money Event is the Farm's income or its expense, and none of this is the
 * Farm's money — it is the Investors', held in the Owner's name, and counting it as the Farm's would
 * make the books say the farm earned what it only ever looked after.
 */
export const ventureMovement = pgTable(
  "venture_movement",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    ventureId: text("venture_id")
      .notNull()
      .references(() => venture.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: VENTURE_MOVEMENT_KINDS }).notNull(),
    /** Whose money moved, by the paper they signed: capital in and the refund that undoes it. A Float
     *  is the Venture's own money going to the haat and belongs to no one Investor, so it has none. */
    agreementId: text("agreement_id").references(() => investmentAgreement.id),
    /** The outing a Buying Float was drawn for. Only a Float has one. */
    buyingTripId: text("buying_trip_id").references(() => buyingTrip.id),
    /** The month a Reimbursement is for, "YYYY-MM". Only a Reimbursement has one, and a Venture has one
     *  Reimbursement per month. */
    forMonth: text("for_month"),
    /** The Internal Sale this is one side of. Only an Internal Sale's movements have one. By id and
     *  not by foreign key: an Internal Sale is an Animal's record and lives with the fattening ones,
     *  and a reference from here would send the schema round in a circle. */
    internalSaleId: text("internal_sale_id"),
    /** The Sale a buyer took her away on, whose price landed in this account. Only a Sale's movement
     *  has one, and by id rather than by foreign key for the same reason an Internal Sale's is. */
    saleId: text("sale_id"),
    amountBdt: numeric("amount_bdt", { precision: 12, scale: 2 }).notNull(),
    /** The day the bank moved it, on the farm's own clock. */
    movedOn: text("moved_on").notNull(),
    /** Bank channels only: the transfer, the cheque or the deposit slip, and what it is numbered. */
    reference: text("reference").notNull(),
    /** The movement this one sends back: a refund is tied to the capital it returns, and the cash off a
     *  Buying Float to the Float that took it to the haat. */
    refundsId: text("refunds_id"),
    /** When a Buying Float was reconciled, and by whom: what went out, counted against the animals it
     *  bought, the outing's own costs and the cash brought home. Only a Float has them, and until it
     *  has them the Float is open. */
    reconciledAt: timestamp("reconciled_at"),
    reconciledBy: text("reconciled_by").references(() => user.id),
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("venture_movement_idx").on(table.farmId, table.ventureId),
    // One Float per outing: a trip given money twice is a trip nobody can reconcile.
    uniqueIndex("venture_movement_float_uidx")
      .on(table.buyingTripId)
      .where(sql`${table.kind} = 'float_out'`),
    // One refund per movement, so calling a Venture off twice cannot send the same taka back twice.
    uniqueIndex("venture_movement_refunds_uidx").on(table.refundsId),
    // One movement per Sale: what a buyer paid reaches the account once.
    uniqueIndex("venture_movement_sale_uidx").on(table.saleId),
    // One Reimbursement per Venture per month: a month repaid twice is a month an Investor pays for
    // twice.
    uniqueIndex("venture_movement_month_uidx")
      .on(table.farmId, table.ventureId, table.forMonth)
      .where(sql`${table.kind} = 'reimbursement'`),
  ]
);

/**
 * What the Venture Account really held at a month's end, read off the bank's own statement, beside what
 * the farm thought it should hold.
 *
 * A mistake caught in weeks is one somebody can still remember; the same mistake found at settlement is
 * a figure nobody can unpick with Investors waiting. A month that disagrees is kept as disagreeing — the
 * Owner writes down what she found out about it rather than quietly making it agree — and a Settlement
 * will not close over one.
 */
export const ventureBankCheck = pgTable(
  "venture_bank_check",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    ventureId: text("venture_id")
      .notNull()
      .references(() => venture.id, { onDelete: "cascade" }),
    /** The month it is of, "YYYY-MM". One check per Venture per month. */
    forMonth: text("for_month").notNull(),
    /** What the statement said, and what the farm thought at the moment she read it. */
    readBdt: numeric("read_bdt", { precision: 12, scale: 2 }).notNull(),
    expectedBdt: numeric("expected_bdt", { precision: 12, scale: 2 }).notNull(),
    /** What she found out about a difference, where she has found out anything. */
    note: text("note"),
    checkedBy: text("checked_by").references(() => user.id),
    checkedAt: timestamp("checked_at").notNull(),
  },
  (table) => [
    uniqueIndex("venture_bank_check_uidx").on(
      table.farmId,
      table.ventureId,
      table.forMonth
    ),
  ]
);

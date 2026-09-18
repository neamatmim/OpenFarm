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
 * What a Venture Movement is for. Capital in and the refund that undoes it are all this ticket needs;
 * the Float, the Advance, the Reimbursement and the payout join them as their own work arrives.
 */
export const VENTURE_MOVEMENT_KINDS = ["capital_in", "refund"] as const;
export type VentureMovementKind = (typeof VENTURE_MOVEMENT_KINDS)[number];

/**
 * One movement of a Venture's own money through its Venture Account: capital arriving against an
 * Agreement, and the refund that sends it back when the Venture is called off.
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
    /** Whose money moved, by the paper they signed. Every kind this ticket knows has one. */
    agreementId: text("agreement_id")
      .notNull()
      .references(() => investmentAgreement.id),
    amountBdt: numeric("amount_bdt", { precision: 12, scale: 2 }).notNull(),
    /** The day the bank moved it, on the farm's own clock. */
    movedOn: text("moved_on").notNull(),
    /** Bank channels only: the transfer, the cheque or the deposit slip, and what it is numbered. */
    reference: text("reference").notNull(),
    /** The movement this one sends back, so a refund is tied to the taka it returns. */
    refundsId: text("refunds_id"),
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("venture_movement_idx").on(table.farmId, table.ventureId),
    // One refund per movement, so calling a Venture off twice cannot send the same taka back twice.
    uniqueIndex("venture_movement_refunds_uidx").on(table.refundsId),
  ]
);

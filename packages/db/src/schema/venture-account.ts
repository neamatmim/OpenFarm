import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";
import { intake, internalSale, sale } from "./fattening";
import { handover } from "./money";
import { heldUnits, numericMoney } from "./numeric-columns";
import { buyingTrip } from "./trip";
import { investmentAgreement, investor, venture } from "./venture";

// A Venture's money as its Venture Account holds it: every movement in and out, the bank's own checks against it, and
// the Settlement that closes it with each Investor's share. Kept apart from the Venture's own records so that a
// movement may point at the Sale, the Internal Sale, the Intake or the Handover it came from: those live with the
// fattening and the money records, which the Venture's own records sit beneath.

/**
 * What a Venture Movement is for: capital in, the refund that undoes it, the Buying Float drawn for one
 * trip to the livestock market, the cash that Float brings home, the two sides of an **Internal Sale** — a Venture
 * paying for an Animal it takes on, and being paid for one it lets go — and the monthly
 * **Reimbursement** of what its Animals consumed of what the Farm bought, and the Owner's **Advance**
 * when the Running Budget has run out, what a buyer paid for one of its Animals, and — once its Settlement
 * is approved — each Investor paid what he is owed, the Owner's Advance repaid at cost, and the Farm's own
 * share of the profit leaving for the Farm's books.
 */
export const VENTURE_MOVEMENT_KINDS = [
  "capital_in",
  "refund",
  "float_out",
  "float_back",
  "internal_buy",
  "internal_sell",
  "sale_in",
  "payout",
  "advance_repaid",
  "farm_share",
  // The Farm's share of a loss, paid in: a run that lost money splits the loss as it would a profit, and
  // the Farm's part of it is money the account does not hold until the Farm puts it there.
  "farm_loss_in",
  "reimbursement",
  "advance",
  // A bull bought with no outing — at the farm gate, from a neighbour — paid straight from the account by bank, and
  // written from her Intake as a Sale's money is from the Sale.
  "intake_out",
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
      .references(() => venture.id),
    kind: text("kind", { enum: VENTURE_MOVEMENT_KINDS }).notNull(),
    /** Whose money moved, by the paper they signed: capital in and the refund that undoes it. A Float
     *  is the Venture's own money going to the livestock market and belongs to no one Investor, so it has none. */
    agreementId: text("agreement_id").references(() => investmentAgreement.id),
    /** The outing a Buying Float was drawn for. Only a Float has one. */
    buyingTripId: text("buying_trip_id").references(() => buyingTrip.id),
    /** The month a Reimbursement is for, "YYYY-MM". Only a Reimbursement has one, and a Venture has one
     *  Reimbursement per month. */
    forMonth: text("for_month"),
    /** What a Reimbursement carried besides its own month: each earlier month already repaid whose figure has moved
     *  since, and by how much, more or less. Its own month's figure is its amount less these. Only a Reimbursement
     *  has them; one written before they were carried carries nothing. */
    carried: jsonb("carried").$type<{ month: string; amount: number }[]>(),
    /** The Internal Sale this is one side of. Only an Internal Sale's movements have one. */
    internalSaleId: text("internal_sale_id").references(() => internalSale.id),
    /** The Sale a buyer took her away on, whose price landed in this account. Only a Sale's movement has one. */
    saleId: text("sale_id").references(() => sale.id),
    /** The Intake of a bull bought with no outing and paid from this account by bank. Only that movement has one. */
    intakeId: text("intake_id").references(() => intake.id),
    /** The deposit that carried a cash Sale's money here from the hand that took it at the livestock market. */
    handoverId: text("handover_id").references(() => handover.id),
    amountMoney: numericMoney("amount_money").notNull(),
    /** The day the bank moved it, on the farm's own clock. */
    movedOn: text("moved_on").notNull(),
    /** Bank channels only: the transfer, the cheque or the deposit slip, and what it is numbered. */
    reference: text("reference").notNull(),
    /** The movement this one sends back: a refund is tied to the capital it returns, and the cash off a
     *  Buying Float to the Float that took it to the livestock market. */
    refundsId: text("refunds_id").references(
      (): AnyPgColumn => ventureMovement.id
    ),
    /** When a Buying Float was reconciled, and by whom: what went out, counted against the animals it
     *  bought, the outing's own costs and the cash brought home. Only a Float has them, and until it
     *  has them the Float is open. */
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledBy: text("reconciled_by").references(() => user.id),
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "venture_movement_month",
      sql`${table.forMonth} is null or ${table.forMonth} ~ '^[0-9]{4}-[0-9]{2}$'`
    ),
    index("venture_movement_idx").on(table.farmId, table.ventureId),
    index("venture_movement_agreement_idx").on(table.agreementId),
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
      .references(() => venture.id),
    /** The month it is of, "YYYY-MM". One check per Venture per month. */
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
      "venture_bank_check_month",
      sql`${table.forMonth} ~ '^[0-9]{4}-[0-9]{2}$'`
    ),
    uniqueIndex("venture_bank_check_uidx").on(
      table.farmId,
      table.ventureId,
      table.forMonth
    ),
  ]
);

/**
 * A Venture's Settlement as the Owner approved it: the figures written down as they stood.
 *
 * The whole point of approving is that they stop moving — what an Investor is shown a year later is what
 * he was shown then, whatever else the farm has learned since. A late cost or a Correction after this is
 * a **Settlement Adjustment**, which leaves these figures alone.
 */
export const ventureSettlement = pgTable(
  "venture_settlement",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    ventureId: text("venture_id")
      .notNull()
      .references(() => venture.id),
    /** What its Animals fetched, and everything the run was charged. */
    proceedsMoney: numericMoney("proceeds_money").notNull(),
    chargedMoney: numericMoney("charged_money").notNull(),
    /** Every charge as its own line, as the statement showed it: `[{ word, amount }]` — "bought", "market toll",
     *  "trips", "feed", "medicine", "vet", "herd". Frozen, never queried and never joined, which is why
     *  they live here rather than in a table of their own. */
    charges: jsonb("charges").notNull(),
    profitMoney: numericMoney("profit_money").notNull(),
    /** The split as the Agreements froze it, and what it came to. */
    investorsPercent: integer("investors_percent").notNull(),
    /** Every Unit held — paid for — across its Agreements, which is what the profit divided by. */
    units: heldUnits("units").notNull(),
    investorsMoney: numericMoney("investors_money").notNull(),
    perUnitMoney: numericMoney("per_unit_money").notNull(),
    /** What flooring left over, which is the Farm's. */
    roundingMoney: numericMoney("rounding_money").notNull(),
    farmMoney: numericMoney("farm_money").notNull(),
    /** The Owner's own money, repaid at cost before any capital returns. */
    advanceMoney: numericMoney("advance_money").notNull(),
    capitalMoney: numericMoney("capital_money").notNull(),
    /** What the account held when it was approved, which everything above adds up to. */
    balanceMoney: numericMoney("balance_money").notNull(),
    /** The movement the Owner's Advance went back to her on, once it has. */
    advanceRepaidId: text("advance_repaid_id").references(
      () => ventureMovement.id
    ),
    /** The movement the Farm's own share left on. The Farm's money never stays in a Venture Account. */
    farmSharePaidId: text("farm_share_paid_id").references(
      () => ventureMovement.id
    ),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // One Settlement per Venture: approving twice is two answers to the same question.
    uniqueIndex("venture_settlement_uidx").on(table.farmId, table.ventureId),
  ]
);

/**
 * What one Investor is owed by an approved Settlement, and what has happened about it.
 *
 * Frozen with the Settlement, then the payout against it and his acknowledgement of it — so that "I never
 * got it" has an answer that is not somebody's memory.
 */
export const ventureSettlementShare = pgTable(
  "venture_settlement_share",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    settlementId: text("settlement_id")
      .notNull()
      .references(() => ventureSettlement.id),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => investmentAgreement.id),
    investorId: text("investor_id")
      .notNull()
      .references(() => investor.id),
    /** The Units he held: his capital over the Unit price, a fraction where he paid part of one. */
    units: heldUnits("units").notNull(),
    /** His capital back, what his Units took of the profit, and the two together. */
    capitalMoney: numericMoney("capital_money").notNull(),
    shareMoney: numericMoney("share_money").notNull(),
    payoutMoney: numericMoney("payout_money").notNull(),
    /** The Venture Movement the money went out on, once it has. */
    paidMovementId: text("paid_movement_id").references(
      () => ventureMovement.id
    ),
    /** When he said he had it, and anything he said about it. */
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedNote: text("acknowledged_note"),
    acknowledgedBy: text("acknowledged_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // One share per Agreement, not per Investor: the same person may hold two papers on one Venture, and
    // each is its own promise with its own Units.
    uniqueIndex("venture_settlement_share_uidx").on(
      table.settlementId,
      table.agreementId
    ),
    // Whose the share is, held to whose the paper is: a share can never name one Investor on another's Agreement.
    foreignKey({
      name: "venture_settlement_share_agreement_investor_fk",
      columns: [table.agreementId, table.investorId],
      foreignColumns: [investmentAgreement.id, investmentAgreement.investorId],
    }),
  ]
);

/** What became of a Settlement Adjustment: noted only, waiting to be dealt with, paid, or waived. */
export const ADJUSTMENT_OUTCOMES = [
  "noted",
  "outstanding",
  "paid",
  "waived",
] as const;
export type AdjustmentOutcome = (typeof ADJUSTMENT_OUTCOMES)[number];

/**
 * A Correction or a late cost landing after a Settlement was approved.
 *
 * The Settlement's own figures stand and money already paid is never chased. This says what each
 * Investor's share would be now, and — above the figure the Farm sets — what was done about it: a
 * supplementary payout, or a waiver the Owner writes down and stands behind. Below that figure it is
 * noted and nothing moves, because a hundred taka should not cost a trip to the bank.
 */
export const settlementAdjustment = pgTable(
  "venture_settlement_adjustment",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    settlementId: text("settlement_id")
      .notNull()
      .references(() => ventureSettlement.id),
    /** What arrived late, in the Owner's words. Asked for: an Investor reading this years later is owed
     *  a reason and not only a figure. */
    reason: text("reason").notNull(),
    /** What the run would come to now, worked out the same way the Settlement was. */
    profitMoney: numericMoney("profit_money").notNull(),
    perUnitMoney: numericMoney("per_unit_money").notNull(),
    /** What that is against the frozen figures: what one Unit gained or lost by the late news, and what
     *  every Unit did together. Negative where the news was bad. */
    perUnitDifferenceMoney: numericMoney("per_unit_difference_money").notNull(),
    investorsDifferenceMoney: numericMoney(
      "investors_difference_money"
    ).notNull(),
    /** The figure it was judged against, frozen with it: turning the Farm Parameter afterwards must not
     *  change what an Adjustment already decided about itself. */
    thresholdMoney: numericMoney("threshold_money").notNull(),
    outcome: text("outcome", { enum: ADJUSTMENT_OUTCOMES }).notNull(),
    /** What the Owner said when she waived it, which she stands behind. */
    waivedNote: text("waived_note"),
    /** When it stopped being outstanding, and who made it stop. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by").references(() => user.id),
    raisedBy: text("raised_by").references(() => user.id),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("venture_settlement_adjustment_idx").on(
      table.farmId,
      table.settlementId
    ),
  ]
);

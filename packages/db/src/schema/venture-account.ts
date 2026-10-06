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
import { animal } from "./herd";
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
  // A Venture's animal written off as lost, made good by the Farm at what she had cost the Venture: the Farm's own
  // money in, so a theft or a stray costs the Investors nothing.
  "made_good",
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
    /** The animal a `made_good` movement makes good: lost, and paid for by the Farm at what she had cost. Only a
     *  made-good movement has one. */
    animalId: text("animal_id").references(() => animal.id),
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
    /** Who carries a Buying Float's notes to the livestock market: the hand its cash is expected in, as a Venture's
     *  sale cash is, until it is counted home. Null for a Float drawn before carriers were named (2026-10-07). */
    heldBy: text("held_by").references(() => user.id),
    /** What a Float counted home did not account for — positive where it came home short, negative where the outing
     *  spent more than it took — and why, in the Owner's words. Only a Float's homecoming has them, and only when it
     *  did not balance to the taka (the Owner, 2026-10-07). */
    differenceMoney: numericMoney("difference_money"),
    differenceReason: text("difference_reason"),
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

/** How an Investor says they sent money towards an Agreement: by bank — a transfer, a cheque or a deposit slip — or
 *  by Mobile Money sent into the Venture Account, which lands there as the bank's own credit (ADR 0018). Mirrored in the
 *  domain, for the screens; a test holds them together. */
export const PAY_IN_WAYS = [
  "bank_transfer",
  "cheque",
  "deposit_slip",
  "mobile_money",
] as const;

/**
 * Where a Pay-in Note stands. Waiting for the Owner to look at the Venture Account; received, the Owner having recorded
 * the capital from it; not found, with the Owner's line; withdrawn by the Investor; or closed by the farm when nothing
 * is owed on the Agreement any more, or its Venture takes no more capital, or the Investor was retired. Never deleted.
 */
export const PAY_IN_NOTE_STATES = [
  "waiting",
  "received",
  "not_found",
  "withdrawn",
  "closed",
] as const;

/** Why the farm closed a Pay-in Note nobody answered: nothing left owing on its Agreement, its Venture taking no more
 *  capital, or its Investor retired. */
export const PAY_IN_CLOSE_REASONS = [
  "nothing_owed",
  "venture_takes_no_capital",
  "investor_retired",
] as const;

/** What an Investor did to their own Pay-in Note, kept beneath it. */
export const PAY_IN_CHANGE_KINDS = ["sent", "changed", "withdrawn"] as const;

/**
 * A **Pay-in Note**: an Investor's word, from the portal, that they sent money towards one of their Agreements outside
 * it — how much, the day, the way and the reference the bank or the provider gave. It moves no money and records no
 * capital; the Owner checks the Venture Account and records the capital from it, or answers not found (ADR 0018).
 */
export const payInNote = pgTable(
  "pay_in_note",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    ventureId: text("venture_id")
      .notNull()
      .references(() => venture.id),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => investmentAgreement.id),
    investorId: text("investor_id")
      .notNull()
      .references(() => investor.id),
    /** What they say they sent, as it stands now. */
    amountMoney: numericMoney("amount_money").notNull(),
    /** The day they say it went, on the farm's own clock. */
    sentOn: text("sent_on").notNull(),
    way: text("way", { enum: PAY_IN_WAYS }).notNull(),
    /** The reference the bank or the provider gave: the transfer's, the cheque's number, the slip's, the TrxID. */
    reference: text("reference").notNull(),
    state: text("state", { enum: PAY_IN_NOTE_STATES })
      .notNull()
      .default("waiting"),
    /** The account that sent it: the Investor's own. */
    sentBy: text("sent_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** The capital the Owner recorded from it, for one received. */
    movementId: text("movement_id").references(() => ventureMovement.id),
    /** For "not found", the Owner's line to the Investor. */
    answerLine: text("answer_line"),
    answeredBy: text("answered_by").references(() => user.id),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    /** Why and when the farm closed it, for one closed by what happened to the Agreement, the Venture or the Investor. */
    closedBecause: text("closed_because", { enum: PAY_IN_CLOSE_REASONS }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "pay_in_note_sent_on_day",
      sql`${table.sentOn} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check("pay_in_note_amount_above_nothing", sql`${table.amountMoney} > 0`),
    index("pay_in_note_venture_idx").on(table.farmId, table.ventureId),
    index("pay_in_note_agreement_idx").on(table.agreementId),
    // One capital movement answers one note: the same money is not received twice.
    uniqueIndex("pay_in_note_movement_uidx")
      .on(table.movementId)
      .where(sql`${table.movementId} is not null`),
  ]
);

/** What the Investor did to their own Pay-in Note, each kept with what it said then — so "I said fifty thousand, not
 *  five" has an answer. */
export const payInNoteChange = pgTable(
  "pay_in_note_change",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    noteId: text("note_id")
      .notNull()
      .references(() => payInNote.id),
    kind: text("kind", { enum: PAY_IN_CHANGE_KINDS }).notNull(),
    amountMoney: numericMoney("amount_money").notNull(),
    sentOn: text("sent_on").notNull(),
    way: text("way", { enum: PAY_IN_WAYS }).notNull(),
    reference: text("reference").notNull(),
    madeBy: text("made_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("pay_in_note_change_idx").on(table.farmId, table.noteId)]
);

/** The photo of the slip or the screenshot an Investor sent with their Pay-in Note, if they sent one: kept apart from
 *  the note, so a list of notes never carries the pictures. */
export const payInNotePhoto = pgTable("pay_in_note_photo", {
  noteId: text("note_id")
    .primaryKey()
    .references(() => payInNote.id),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  /** Downscaled on the device before upload, base64. */
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

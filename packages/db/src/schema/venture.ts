import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";
import { paperTemplateVersion } from "./paper-template";
import { taka } from "./taka";
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
    targetCapitalBdt: taka("target_capital_bdt").notNull(),
    floorBdt: taka("floor_bdt").notNull(),
    /** The day the Floor must be met by, as a calendar names it. */
    decideBy: text("decide_by").notNull(),
    /** The period the Venture means to sell in; its Animals inherit it. */
    targetWindowStart: text("target_window_start").notNull(),
    targetWindowEnd: text("target_window_end").notNull(),
    /** What one Unit costs, and how many there are. An Investor holds whole Units. */
    unitPriceBdt: taka("unit_price_bdt").notNull(),
    units: integer("units").notNull(),
    /** The part of the capital meant for buying animals; the rest is the Running Budget. */
    cattleBudgetBdt: taka("cattle_budget_bdt").notNull(),
    /** Why a Venture was called off, in the Owner's words. */
    cancelledReason: text("cancelled_reason"),
    /** When the Owner showed it to invited Investors in the portal; empty while it is not shown (ADR 0008). */
    shownInPortalAt: timestamp("shown_in_portal_at"),
    /** The Owner's few words on it for the portal, beside its terms. */
    portalWords: text("portal_words"),
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
    /** Retired, never removed: their Agreements, payouts and statements are kept for twelve years and every
     *  one of them names them. A retired Investor is not signed for another Venture until brought back. */
    retiredAt: timestamp("retired_at"),
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
 * An Investor's way into the portal, where they read their own Ventures and papers (ADR 0007). One per Investor,
 * written by the Owner's invitation: a one-time code handed over in person, taken up with the Investor's phone
 * number and a password they choose, which opens an account that holds no Role on the farm and never can.
 *
 * The account signs in as `loginEmail`, an address made from the Investor's phone that no mail ever reaches: the
 * farm's accounts are addressed by email, an Investor is known by their phone, and the address is how the one is
 * written as the other. Taken away, the account is disabled and its sessions end; invited again, it is the same
 * account, given a new password.
 */
export const investorAccess = pgTable(
  "investor_access",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    investorId: text("investor_id")
      .notNull()
      .references(() => investor.id),
    /** The account, once the invitation is taken up. */
    userId: text("user_id").references(() => user.id),
    loginEmail: text("login_email").notNull(),
    /** The open invitation's code, hashed; cleared once it is used. */
    codeHash: text("code_hash"),
    codeExpiresAt: timestamp("code_expires_at"),
    invitedBy: text("invited_by").references(() => user.id),
    invitedAt: timestamp("invited_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    revokedAt: timestamp("revoked_at"),
    /** When they were last in the portal, to the hour: kept here because sessions end and are cleared. */
    lastSeenAt: timestamp("last_seen_at"),
  },
  (table) => [
    uniqueIndex("investor_access_investor_uidx").on(table.investorId),
    // One account per phone: two Investors on one number could not each sign in with it.
    uniqueIndex("investor_access_login_uidx").on(table.loginEmail),
  ]
);

/** How the Agreement's stamp duty was paid: on stamp paper, or by e-challan into the treasury with no paper to
 *  stamp. Its own copy, as the schema's other enums are. */
export const STAMP_KINDS = ["paper", "e_challan"] as const;

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
    /** The stamped instrument: how its duty was paid, what it came to, the day, and the stamp paper's serial —
     *  or, paid by e-challan, the challan's number. */
    stampKind: text("stamp_kind", { enum: STAMP_KINDS })
      .notNull()
      .default("paper"),
    stampValueBdt: taka("stamp_value_bdt").notNull(),
    stampedOn: text("stamped_on").notNull(),
    stampSerial: text("stamp_serial").notNull(),
    /** The wording it was printed and signed in. Every Agreement signed before the wording could be edited is
     *  recorded against the standard wording the farm was given, which is what those papers said. */
    templateVersionId: text("template_version_id").references(
      () => paperTemplateVersion.id
    ),
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

/**
 * Where a Request to Join stands. Waiting for the Owner; told to come and sign; told not this time; withdrawn by the
 * Investor; answered by a signed Agreement; or closed by the farm when the Venture moved on or the Investor was
 * retired. Never deleted: who asked for what outlives the Venture.
 */
export const REQUEST_TO_JOIN_STATES = [
  "waiting",
  "come_and_sign",
  "not_this_time",
  "withdrawn",
  "signed",
  "closed",
] as const;

/** A Request somebody is still waiting on: at most one of these per Investor per Venture. */
export const LIVE_REQUEST_STATES = ["waiting", "come_and_sign"] as const;

/**
 * An invited Investor saying, through the portal, that they want to join a Venture the Owner has shown: whole Units
 * and a note. It binds nobody, holds no Units and moves no money — only a signed Agreement does (ADR 0008).
 *
 * Asking again while one is live changes it rather than adding a second; what it said before is in its changes.
 */
export const requestToJoin = pgTable(
  "request_to_join",
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
    /** Whole Units, as it stands now. */
    units: integer("units").notNull(),
    /** The Investor's own words for the Owner, such as when they can pay. */
    note: text("note"),
    state: text("state", { enum: REQUEST_TO_JOIN_STATES })
      .notNull()
      .default("waiting"),
    /** The account that asked: the Investor's own, opened from their invitation. */
    madeBy: text("made_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("request_to_join_venture_idx").on(table.farmId, table.ventureId),
    // One live Request per Investor per Venture: asking again changes it, never piles up a second.
    uniqueIndex("request_to_join_live_uidx")
      .on(table.ventureId, table.investorId)
      .where(sql`${table.state} in ('waiting', 'come_and_sign')`),
  ]
);

/** What an Investor did to their own Request. */
export const REQUEST_CHANGE_KINDS = ["made", "changed", "withdrawn"] as const;

/**
 * One thing an Investor did to their Request, with the Units and note as they then were: the history the Owner
 * reads beneath it, so "I only asked for four" has an answer. Written in the same transaction as its Audit Event.
 */
export const requestToJoinChange = pgTable(
  "request_to_join_change",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    requestId: text("request_id")
      .notNull()
      .references(() => requestToJoin.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: REQUEST_CHANGE_KINDS }).notNull(),
    units: integer("units").notNull(),
    note: text("note"),
    madeBy: text("made_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("request_to_join_change_idx").on(table.farmId, table.requestId),
  ]
);

/**
 * One paper amending a Venture's Agreements: the terms it changed, the day everybody signed it, and the
 * photograph of it.
 *
 * One physical paper signed by every Investor in the Venture, written down as one row per Agreement —
 * which is what makes "the agreement in force at a time is the latest amendment on or before it" a
 * question with an answer. The Agreement itself is never edited: what an Investor signed at the start
 * stays legible beside what it became.
 *
 * Only what story 7 lets move: the split and the Target Window. Units are fixed once a Venture starts
 * buying, and the cap, the capital already taken and every share worked out since all rest on them.
 */
export const agreementAmendment = pgTable(
  "agreement_amendment",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => investmentAgreement.id, { onDelete: "cascade" }),
    /** The one act these rows were written by, so a Venture's amendment reads as one paper again. */
    amendedId: text("amended_id").notNull(),
    /** The day every Investor signed it. What was in force on a day is decided by this, not by when
     *  somebody got round to typing it in. */
    signedOn: text("signed_on").notNull(),
    investorsPercent: integer("investors_percent").notNull(),
    targetWindowStart: text("target_window_start").notNull(),
    targetWindowEnd: text("target_window_end").notNull(),
    /** Why it was amended, in the Owner's own words — a dispute years later asks this first. */
    reason: text("reason").notNull(),
    /** The wording the Amendment was printed in, where the farm printed it; none for one amended before it could. */
    templateVersionId: text("template_version_id").references(
      () => paperTemplateVersion.id
    ),
    amendedBy: text("amended_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    // One amendment per Agreement per act: the same paper may not be written against a man twice.
    uniqueIndex("agreement_amendment_uidx").on(
      table.agreementId,
      table.amendedId
    ),
  ]
);

/** The photograph of an amendment, kept once for the one paper everybody signed. */
export const amendmentPaper = pgTable("amendment_paper", {
  amendedId: text("amended_id").primaryKey(),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  /** Downscaled on the device before upload, base64. */
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

/** The photo of a stamped Investment Agreement, kept beside the paper it is a picture of: one per Agreement, the
 *  Farm's proof of it. */
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
    amountBdt: taka("amount_bdt").notNull(),
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
    readBdt: taka("read_bdt").notNull(),
    expectedBdt: taka("expected_bdt").notNull(),
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
      .references(() => venture.id, { onDelete: "cascade" }),
    /** What its Animals fetched, and everything the run was charged. */
    proceedsBdt: taka("proceeds_bdt").notNull(),
    chargedBdt: taka("charged_bdt").notNull(),
    /** Every charge as its own line, as the statement showed it: `[{ word, bdt }]` — "bought", "hasil",
     *  "trips", "feed", "medicine", "vet", "herd". Frozen, never queried and never joined, which is why
     *  they live here rather than in a table of their own. */
    charges: jsonb("charges").notNull(),
    profitBdt: taka("profit_bdt").notNull(),
    /** The split as the Agreements froze it, and what it came to. */
    investorsPercent: integer("investors_percent").notNull(),
    units: integer("units").notNull(),
    investorsBdt: taka("investors_bdt").notNull(),
    perUnitBdt: taka("per_unit_bdt").notNull(),
    /** What flooring left over, which is the Farm's. */
    roundingBdt: taka("rounding_bdt").notNull(),
    farmBdt: taka("farm_bdt").notNull(),
    /** The Owner's own money, repaid at cost before any capital returns. */
    advanceBdt: taka("advance_bdt").notNull(),
    capitalBdt: taka("capital_bdt").notNull(),
    /** What the account held when it was approved, which everything above adds up to. */
    balanceBdt: taka("balance_bdt").notNull(),
    /** The movement the Owner's Advance went back to her on, once it has. */
    advanceRepaidId: text("advance_repaid_id"),
    /** The movement the Farm's own share left on. The Farm's money never stays in a Venture Account. */
    farmSharePaidId: text("farm_share_paid_id"),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at").notNull(),
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
      .references(() => ventureSettlement.id, { onDelete: "cascade" }),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => investmentAgreement.id),
    investorId: text("investor_id").notNull(),
    units: integer("units").notNull(),
    /** His capital back, what his Units took of the profit, and the two together. */
    capitalBdt: taka("capital_bdt").notNull(),
    shareBdt: taka("share_bdt").notNull(),
    payoutBdt: taka("payout_bdt").notNull(),
    /** The Venture Movement the money went out on, once it has. */
    paidMovementId: text("paid_movement_id"),
    /** When he said he had it, and anything he said about it. */
    acknowledgedAt: timestamp("acknowledged_at"),
    acknowledgedNote: text("acknowledged_note"),
    acknowledgedBy: text("acknowledged_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    // One share per Agreement, not per Investor: the same person may hold two papers on one Venture, and
    // each is its own promise with its own Units.
    uniqueIndex("venture_settlement_share_uidx").on(
      table.settlementId,
      table.agreementId
    ),
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
      .references(() => ventureSettlement.id, { onDelete: "cascade" }),
    /** What arrived late, in the Owner's words. Asked for: an Investor reading this years later is owed
     *  a reason and not only a figure. */
    reason: text("reason").notNull(),
    /** What the run would come to now, worked out the same way the Settlement was. */
    profitBdt: taka("profit_bdt").notNull(),
    perUnitBdt: taka("per_unit_bdt").notNull(),
    /** What that is against the frozen figures: what one Unit gained or lost by the late news, and what
     *  every Unit did together. Negative where the news was bad. */
    perUnitDifferenceBdt: taka("per_unit_difference_bdt").notNull(),
    investorsDifferenceBdt: taka("investors_difference_bdt").notNull(),
    /** The figure it was judged against, frozen with it: turning the Farm Parameter afterwards must not
     *  change what an Adjustment already decided about itself. */
    thresholdBdt: taka("threshold_bdt").notNull(),
    outcome: text("outcome", { enum: ADJUSTMENT_OUTCOMES }).notNull(),
    /** What the Owner said when she waived it, which she stands behind. */
    waivedNote: text("waived_note"),
    /** When it stopped being outstanding, and who made it stop. */
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => user.id),
    raisedBy: text("raised_by").references(() => user.id),
    raisedAt: timestamp("raised_at").notNull(),
  },
  (table) => [
    index("venture_settlement_adjustment_idx").on(
      table.farmId,
      table.settlementId
    ),
  ]
);

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";
import { numericMoney } from "./numeric-columns";
import { paperTemplateVersion } from "./paper-template";

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

/** How a Venture's Investors pay for their Units: all before the buying, or the Cattle Part first and the rest in
 *  Monthly Sums. Mirrored in @OpenFarm/domain (`CAPITAL_PAID`). */
export const CAPITAL_PAID = ["before_buying", "by_the_month"] as const;

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
    /** Its place among the farm's Ventures in the order they were opened, counted from one: the first number in its
     *  Agreements' Pay-in Codes. Kept rather than counted, so a Venture written with an earlier day moves nobody's. */
    ordinal: integer("ordinal").notNull(),
    name: text("name").notNull(),
    state: text("state", { enum: VENTURE_STATES }).notNull().default("open"),
    /** What the Owner is looking to raise, and the least it is worth starting on. */
    targetCapitalMoney: numericMoney("target_capital_money").notNull(),
    floorMoney: numericMoney("floor_money").notNull(),
    /** The day the Floor must be met by, as a calendar names it. */
    decideBy: text("decide_by").notNull(),
    /** The period the Venture means to sell in; its Animals inherit it. */
    targetWindowStart: text("target_window_start").notNull(),
    targetWindowEnd: text("target_window_end").notNull(),
    /** The days it keeps selling after its Target Window closes, as the farm's Parameter stood when its first Investor
     *  signed: their Agreement names that many, and a later change to the Parameter moves no Venture already signed for.
     *  Null until then, when the farm's figure stands. */
    windUpDays: integer("wind_up_days"),
    /** What one Unit costs, and how many there are. An Investor holds whole Units. */
    unitPriceMoney: numericMoney("unit_price_money").notNull(),
    units: integer("units").notNull(),
    /** The part of the capital meant for buying animals; the rest is the Running Budget. */
    cattleBudgetMoney: numericMoney("cattle_budget_money").notNull(),
    /** How its Investors pay for their Units. Every Venture before 2026-10-02 was paid before buying. */
    capitalPaid: text("capital_paid", { enum: CAPITAL_PAID })
      .notNull()
      .default("before_buying"),
    /** Paid by the month: the terms it opened on, frozen — what a Unit pays before buying, how many Monthly Sums, and
     *  the day the first falls due (each after it on the same day of the next month). Worked from its budgets and
     *  dates when it opens (`monthlyTermsOf`), and never moved: an Amendment that moves its window moves no Investor's
     *  schedule. Empty for a Venture paid before buying. */
    cattlePartMoney: numericMoney("cattle_part_money"),
    monthlySums: integer("monthly_sums"),
    firstSumDueOn: text("first_sum_due_on"),
    /** Why a Venture was called off, in the Owner's words. */
    cancelledReason: text("cancelled_reason"),
    /** When the Owner showed it to invited Investors in the portal; empty while it is not shown (ADR 0008). */
    shownInPortalAt: timestamp("shown_in_portal_at", { withTimezone: true }),
    /** The Owner's few words on it for the portal, beside its terms. */
    portalWords: text("portal_words"),
    /** The Venture Account, as the Owner writes it: where a signed Investor is told to pay. The bank, the account's
     *  name and its number make it an account one can pay into; the branch and routing number may come later. Written
     *  by the Owner alone, each change in the trail, and shown to an Investor only for capital they have signed for. */
    accountBank: text("account_bank"),
    accountBranch: text("account_branch"),
    accountName: text("account_name"),
    accountNumber: text("account_number"),
    accountRoutingNumber: text("account_routing_number"),
    openedBy: text("opened_by").references(() => user.id),
    openedByRole: text("opened_by_role", { enum: ROLES }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "venture_window_days",
      sql`${table.targetWindowStart} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and ${table.targetWindowEnd} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check(
      "venture_window_in_order",
      sql`${table.targetWindowStart} <= ${table.targetWindowEnd}`
    ),
    check(
      "venture_floor_within_target",
      sql`${table.floorMoney} <= ${table.targetCapitalMoney}`
    ),
    index("venture_state_idx").on(table.farmId, table.state),
    uniqueIndex("venture_ordinal_uidx").on(table.farmId, table.ordinal),
  ]
);

/**
 * One version of a Venture's **Venture Plan**: what the Owner means to buy, and what a kilo will sell at. Every save is
 * a version of its own, never an edit, so what was planned when stays readable; the one saved last while the Venture
 * was still Open is its baseline (`madeWhile`), and one saved after buying began is a revision, with its reason.
 */
export const venturePlan = pgTable(
  "venture_plan",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    ventureId: text("venture_id")
      .notNull()
      .references(() => venture.id),
    version: integer("version").notNull(),
    /** Where the Venture was when this was saved: "open" for a plan made before buying, a later state for a
     *  revision. */
    madeWhile: text("made_while", { enum: VENTURE_STATES }).notNull(),
    saleLowMoneyPerKg: numericMoney("sale_low_money_per_kg").notNull(),
    saleHighMoneyPerKg: numericMoney("sale_high_money_per_kg").notNull(),
    /** The share of its animals the Owner expects not to live to be sold, in per cent: taken off the low end of its
     *  projection, never the high. Nothing for a plan made before it could be said. */
    deathsPercent: numeric("deaths_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    /** Why the plan was revised after buying began; nothing for one made before. */
    reason: text("reason"),
    madeAt: timestamp("made_at", { withTimezone: true }).notNull(),
    madeBy: text("made_by").references(() => user.id),
  },
  (table) => [
    uniqueIndex("venture_plan_version_uidx").on(table.ventureId, table.version),
  ]
);

/** One buying line of a plan version: so many animals bought between two weights, at a price a kilo, gaining so much
 *  a day — of one Breed, or of any. */
export const venturePlanLine = pgTable(
  "venture_plan_line",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => venturePlan.id),
    position: integer("position").notNull(),
    animals: integer("animals").notNull(),
    fromKg: numeric("from_kg", { precision: 7, scale: 2 }).notNull(),
    toKg: numeric("to_kg", { precision: 7, scale: 2 }).notNull(),
    buyMoneyPerKg: numericMoney("buy_money_per_kg").notNull(),
    dailyGainKg: numeric("daily_gain_kg", { precision: 5, scale: 2 }).notNull(),
    /** The Breed this line buys, or nothing for any Breed the livestock market offers. An animal bought counts towards the line of
     *  her Breed that holds her weight before an any-Breed one. No foreign key: the herd schema reads this one, not the
     *  other way about; the plan's save checks it is one of the farm's Breeds. */
    breedId: text("breed_id"),
  },
  (table) => [index("venture_plan_line_plan_idx").on(table.planId)]
);

/**
 * Somebody whose money is in a Venture: known to the Owner personally or personally introduced, resident
 * here, and one of at most twenty at a time, the Owner among them.
 *
 * Not a **Counterparty**, who is paid for something. An Investor shares what the Farm makes, and so needs
 * what paying them and their family needs: a bank account, and their Nominees — kept as each **Nomination** they
 * signed, never on this row, since only a signed paper changes who they are.
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
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** Retired, never removed: their Agreements, payouts and statements are kept for twelve years and every
     *  one of them names them. A retired Investor is not signed for another Venture until brought back. */
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    /** The Farm itself, as the partner for its own capital in a Venture: not a person — no papers, no Nominee, no
     *  portal, and not one of the Investor Cap's twenty, the Owner being one already. One a farm. */
    isFarm: boolean("is_farm").notNull().default(false),
  },
  (table) => [
    uniqueIndex("investor_farm_uidx")
      .on(table.farmId)
      .where(sql`${table.isFarm}`),
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
 * Why the Owner took an Investor's portal access away: they withdrew their Portal Consent, their phone was lost, or the
 * Owner's own decision. Only a withdrawal touches the consent.
 */
export const PORTAL_TAKEN_AWAY_WHY = [
  "withdrew_consent",
  "lost_phone",
  "owner",
] as const;

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
    codeExpiresAt: timestamp("code_expires_at", { withTimezone: true }),
    invitedBy: text("invited_by").references(() => user.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Why it was taken away, with `revokedAt`: null for access taken away before the farm asked why. */
    revokedWhy: text("revoked_why", { enum: PORTAL_TAKEN_AWAY_WHY }),
    /** When they were last in the portal, to the hour: kept here because sessions end and are cleared. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** When they last looked at the Ventures offered to them: one the Owner has shown since is new to them. Theirs to
     *  set by looking; the Owner's Preview never sets it. */
    offersSeenAt: timestamp("offers_seen_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("investor_access_investor_uidx").on(table.investorId),
    // One account per phone: two Investors on one number could not each sign in with it.
    uniqueIndex("investor_access_login_uidx").on(table.loginEmail),
  ]
);

/** How an Investor asked to withdraw their Portal Consent: a signed letter, or a message from their own number. */
export const CONSENT_WITHDRAWN_HOW = ["letter", "message"] as const;

/**
 * An Investor's Portal Consent: signed on paper in front of the Owner, before any code is given, to the portal showing
 * them their own record (the glossary's **Portal Consent**). The paper is filed; the farm records the day, the wording
 * they signed and who recorded it. Withdrawn, it stays on file with the day and how they asked, and a new one is a new
 * row: consent is proven for the time it was given.
 */
export const portalConsent = pgTable(
  "portal_consent",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    investorId: text("investor_id")
      .notNull()
      .references(() => investor.id),
    /** The Version of the consent's wording they signed. */
    versionId: text("version_id")
      .notNull()
      .references(() => paperTemplateVersion.id),
    /** The farm day they signed it. */
    signedOn: timestamp("signed_on", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    /** The day it was withdrawn, and how they asked: filled when they withdraw it, and it stops being in force. */
    withdrawnOn: timestamp("withdrawn_on", { withTimezone: true }),
    withdrawnHow: text("withdrawn_how", { enum: CONSENT_WITHDRAWN_HOW }),
  },
  (table) => [
    index("portal_consent_investor_idx").on(table.investorId),
    // One consent in force at a time; a withdrawn one stays on file beside the next.
    uniqueIndex("portal_consent_in_force_uidx")
      .on(table.investorId)
      .where(sql`${table.withdrawnOn} is null`),
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

/** Why the farm closed a Request nobody closed by hand: the Venture started buying or was called off, the Owner took
 *  it out of the portal, or the Investor was retired. Mirrored in the domain, for the screens. */
export const REQUEST_CLOSE_REASONS = [
  "venture_buying",
  "venture_cancelled",
  "taken_out_of_portal",
  "investor_retired",
] as const;

/** A Request somebody is still waiting on: at most one of these per Investor per Venture. The domain says both lists
 *  too, for the screens; a test holds them together. */
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
      .references(() => venture.id),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** The Owner's answer. For "come and sign", the Units the farm will sign: those asked, or fewer. Held by no
     *  Agreement until one is signed, but no other yes may promise them. */
    answeredUnits: integer("answered_units"),
    /** For "not this time", the Owner's line to the Investor, if she wrote one. */
    answerLine: text("answer_line"),
    /** Who answered, and when: the Owner, whose promise it is. */
    answeredBy: text("answered_by").references(() => user.id),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    /** Why and when the farm closed it, for one closed by what happened to the Venture or the Investor. */
    closedBecause: text("closed_because", { enum: REQUEST_CLOSE_REASONS }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("request_to_join_venture_idx").on(table.farmId, table.ventureId),
    // One live Request per Investor per Venture: asking again changes it, never piles up a second.
    uniqueIndex("request_to_join_live_uidx")
      .on(table.ventureId, table.investorId)
      .where(
        sql`${table.state} in (${sql.raw(LIVE_REQUEST_STATES.map((state) => `'${state}'`).join(", "))})`
      ),
  ]
);

/** How the Agreement's stamp duty was paid: on stamp paper, or by e-challan into the treasury with no paper to
 *  stamp — or none was, the Agreement agreed within the app by the Investor and approved by the Owner. Its own copy, as
 *  the schema's other enums are. */
export const STAMP_KINDS = [
  "paper",
  "e_challan",
  "in_app",
  "farm_own",
] as const;
export type StampKind = (typeof STAMP_KINDS)[number];
/** The kinds a paper is signed and stamped by, as against agreed in the app. */
export const STAMPED_KINDS = ["paper", "e_challan"] as const;

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
      .references(() => venture.id),
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
     *  or, paid by e-challan, the e-challan's number. */
    stampKind: text("stamp_kind", { enum: STAMP_KINDS })
      .notNull()
      .default("paper"),
    stampValueMoney: numericMoney("stamp_value_money").notNull(),
    stampedOn: text("stamped_on").notNull(),
    stampSerial: text("stamp_serial").notNull(),
    /** The farm as it named itself on the day it was signed — its name, address, phone and Registration: what a copy
     *  of the stamped paper is headed with, whatever the farm has been renamed or registered as since. Null for an
     *  Agreement signed before it was kept, which a copy heads with the farm as it is. */
    farmAsSigned: jsonb("farm_as_signed"),
    /** The wording it was printed and signed in. Every Agreement signed before the wording could be edited is
     *  recorded against the standard wording the farm was given, which is what those papers said. */
    templateVersionId: text("template_version_id").references(
      () => paperTemplateVersion.id
    ),
    /** What the Investor writes on the transfer that sends its capital, so the money says whose it is: given when it
     *  is recorded and never changed. Not the reference a Venture Movement carries, which is the bank's. */
    payInCode: text("pay_in_code").notNull(),
    /** The Request to Join this paper answers, when the Investor asked through the portal; none for somebody who
     *  joined by phone. Where the two disagree on Units, the paper is right. */
    requestId: text("request_id").references(() => requestToJoin.id),
    signedBy: text("signed_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "investment_agreement_window_days",
      sql`${table.targetWindowStart} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and ${table.targetWindowEnd} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check(
      "investment_agreement_window_in_order",
      sql`${table.targetWindowStart} <= ${table.targetWindowEnd}`
    ),
    check(
      "investment_agreement_percent_whole",
      sql`${table.investorsPercent} between 0 and 100`
    ),
    index("investment_agreement_investor_idx").on(table.investorId),
    uniqueIndex("investment_agreement_uidx").on(
      table.ventureId,
      table.investorId
    ),
    uniqueIndex("investment_agreement_pay_in_code_uidx").on(
      table.farmId,
      table.payInCode
    ),
    // One paper answers a Request at most once.
    uniqueIndex("investment_agreement_request_uidx").on(table.requestId),
    // What a Settlement's share names together — the paper and whose it is — so the share can be held to both.
    uniqueIndex("investment_agreement_investor_uidx").on(
      table.id,
      table.investorId
    ),
  ]
);

/**
 * An Agreement offered to an Investor to agree to in the app, instead of on stamped paper: the terms, the paper as it
 * was laid out the moment it was offered — what the Investor reads and agrees to, kept as it was — and what became of
 * it. Not an Agreement: nothing counts it until the Owner approves it, and then an Agreement is written from it.
 */
export const agreementOffer = pgTable(
  "agreement_offer",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    ventureId: text("venture_id")
      .notNull()
      .references(() => venture.id),
    investorId: text("investor_id")
      .notNull()
      .references(() => investor.id),
    units: integer("units").notNull(),
    investorsPercent: integer("investors_percent").notNull(),
    arbitrator: text("arbitrator").notNull(),
    /** The Nominees it names, as the Owner wrote them; none for the list in force. */
    nominees: jsonb("nominees"),
    requestId: text("request_id").references(() => requestToJoin.id),
    templateVersionId: text("template_version_id").references(
      () => paperTemplateVersion.id
    ),
    /** The paper as laid out when it was offered: what the Investor read and agreed to, kept as it was. */
    paper: jsonb("paper").notNull(),
    /** Its fingerprint, which the Investor's agreement is recorded against. */
    paperHash: text("paper_hash").notNull(),
    offeredBy: text("offered_by").references(() => user.id),
    offeredAt: timestamp("offered_at", { withTimezone: true }).notNull(),
    /** The Investor agreeing, from their own portal sign-in. */
    agreedBy: text("agreed_by").references(() => user.id),
    agreedAt: timestamp("agreed_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** The Agreement written from it on approval. */
    agreementId: text("agreement_id").references(() => investmentAgreement.id),
  },
  (table) => [
    index("agreement_offer_venture_idx").on(table.ventureId),
    check(
      "agreement_offer_percent_whole",
      sql`${table.investorsPercent} between 0 and 100`
    ),
  ]
);

/**
 * An Amendment offered to every Investor on a Venture to agree to in the app, instead of on a signed paper: the split,
 * the Target Window and why, and the paper as it was laid out the moment it was offered, kept as it is. Not an
 * Amendment: nothing reads it until every Investor on the Venture has agreed and the Owner approves it, and then the
 * Amendment is written from it, signed on the day approved.
 */
export const amendmentOffer = pgTable(
  "amendment_offer",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    ventureId: text("venture_id")
      .notNull()
      .references(() => venture.id),
    investorsPercent: integer("investors_percent").notNull(),
    targetWindowStart: text("target_window_start").notNull(),
    targetWindowEnd: text("target_window_end").notNull(),
    reason: text("reason").notNull(),
    templateVersionId: text("template_version_id").references(
      () => paperTemplateVersion.id
    ),
    /** The paper as laid out when it was offered, naming every Investor then on the Venture: what each agreed to. */
    paper: jsonb("paper").notNull(),
    paperHash: text("paper_hash").notNull(),
    offeredBy: text("offered_by").references(() => user.id),
    offeredAt: timestamp("offered_at", { withTimezone: true }).notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** The Amendment written from it on approval: its rows' `amendedId`. */
    amendedId: text("amended_id"),
  },
  (table) => [
    index("amendment_offer_venture_idx").on(table.ventureId),
    check(
      "amendment_offer_window_days",
      sql`${table.targetWindowStart} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and ${table.targetWindowEnd} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check(
      "amendment_offer_window_in_order",
      sql`${table.targetWindowStart} <= ${table.targetWindowEnd}`
    ),
    check(
      "amendment_offer_percent_whole",
      sql`${table.investorsPercent} between 0 and 100`
    ),
  ]
);

/** One Investor agreeing, from their own portal sign-in, to an Amendment offered in the app, for one Agreement. */
export const amendmentOfferAnswer = pgTable(
  "amendment_offer_answer",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    offerId: text("offer_id")
      .notNull()
      .references(() => amendmentOffer.id),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => investmentAgreement.id),
    agreedBy: text("agreed_by").references(() => user.id),
    agreedAt: timestamp("agreed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("amendment_offer_answer_uidx").on(
      table.offerId,
      table.agreementId
    ),
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
      .references(() => requestToJoin.id),
    kind: text("kind", { enum: REQUEST_CHANGE_KINDS }).notNull(),
    units: integer("units").notNull(),
    note: text("note"),
    madeBy: text("made_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
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
      .references(() => investmentAgreement.id),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "agreement_amendment_window_days",
      sql`${table.targetWindowStart} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and ${table.targetWindowEnd} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check(
      "agreement_amendment_window_in_order",
      sql`${table.targetWindowStart} <= ${table.targetWindowEnd}`
    ),
    check(
      "agreement_amendment_percent_whole",
      sql`${table.investorsPercent} between 0 and 100`
    ),
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * How a Nomination came to be on file: a মনোনয়নপত্র signed in front of the Owner; an Investment Agreement, which
 * names the Nominees it was signed with and so is one too; or a nominee written down before Nominations were kept,
 * carried over and not yet signed for.
 */
export const NOMINATION_HOW = [
  "nomination",
  "agreement",
  "carried_over",
] as const;

/**
 * One paper naming an Investor's Nominees (the glossary's **Nomination**), with every one of them in full. The latest
 * on file is the list in force for all their Agreements. Never edited and never removed: the next one is recorded
 * beside it, and the history of who was named, and when, is the farm's answer to a family.
 */
export const nomination = pgTable(
  "nomination",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    investorId: text("investor_id")
      .notNull()
      .references(() => investor.id),
    /** The farm day it was signed, as an Agreement's stamp day is kept; the day it was carried over, for one never
     *  signed. */
    signedOn: text("signed_on").notNull(),
    how: text("how", { enum: NOMINATION_HOW }).notNull(),
    /** The Agreement that is this Nomination, when it is one. */
    agreementId: text("agreement_id").references(() => investmentAgreement.id),
    /** The Version of the মনোনয়নপত্র's wording it was signed in, when it is one. */
    templateVersionId: text("template_version_id").references(
      () => paperTemplateVersion.id
    ),
    /** Nobody, for one carried over. */
    recordedBy: text("recorded_by").references(() => user.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("nomination_investor_idx").on(table.investorId),
    uniqueIndex("nomination_agreement_uidx")
      .on(table.agreementId)
      .where(sql`${table.agreementId} is not null`),
  ]
);

/**
 * One person a Nomination names (the glossary's **Nominee**): who collects their share of what the Farm pays on the
 * Investor's death and hands it on to the heirs. Up to three on a Nomination, in the order printed. A Nominee under
 * eighteen on the day it was signed collects through their **Receiver**, written down with them.
 */
export const nominee = pgTable(
  "nominee",
  {
    nominationId: text("nomination_id")
      .notNull()
      .references(() => nomination.id),
    /** From one, in the order the paper prints them. */
    place: integer("place").notNull(),
    name: text("name").notNull(),
    /** Their relation to the Investor, in words. */
    relation: text("relation"),
    phone: text("phone"),
    /** Unknown only for a nominee carried over from before dates of birth were kept. */
    bornOn: text("born_on"),
    /** Whole percent of the collecting, never of the inheritance; a Nomination's add to a hundred. */
    sharePercent: integer("share_percent").notNull(),
    receiverName: text("receiver_name"),
    /** The Receiver's relation to the Nominee, in words. */
    receiverRelation: text("receiver_relation"),
    receiverPhone: text("receiver_phone"),
  },
  (table) => [
    primaryKey({ columns: [table.nominationId, table.place] }),
    check(
      "nominee_percent_whole",
      sql`${table.sharePercent} between 0 and 100`
    ),
  ]
);

/** The photo of a signed মনোনয়নপত্র, kept beside it as an Agreement's is: the farm's proof that the Investor named
 *  these people themselves. An Agreement's Nomination has none of its own; its proof is the Agreement's photo. */
export const nominationPaper = pgTable("nomination_paper", {
  nominationId: text("nomination_id")
    .primaryKey()
    .references(() => nomination.id),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  /** Downscaled on the device before upload, base64. */
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/** The photo of a stamped Investment Agreement, kept beside the paper it is a picture of: one per Agreement, the
 *  Farm's proof of it. */
export const agreementPaper = pgTable("agreement_paper", {
  agreementId: text("agreement_id")
    .primaryKey()
    .references(() => investmentAgreement.id),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  /** Downscaled on the device before upload, base64. */
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";
import { paperTemplateVersion } from "./paper-template";
import { INVESTOR_KINDS, investor, portalConsent } from "./venture";

/**
 * An **Application Link**: the Owner's invitation to one person they know to fill in their own details online, in
 * place of the Investor Details Form filled in at a meeting (ADR 0034). Made for a name, a mobile, an email and whether
 * they are a person or an Organization; only that mobile is sent the code that opens it. Good for a week and one
 * Application, and the Owner may withdraw one not yet used. The link itself is shown once and kept only as a hash.
 */
export const applicationLink = pgTable(
  "application_link",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: INVESTOR_KINDS }).notNull(),
    /** Who the Owner made it for: a person's name, or an Organization's, as the Owner knows them. */
    name: text("name").notNull(),
    /** The mobile the code that opens it goes to, and that they sign in to the portal with once approved: for an
     *  Organization, its Signatory's. */
    phone: text("phone").notNull(),
    /** Where the Owner emails it: lowercased, as typed. Null for a link the Owner only texts or copies. */
    email: text("email"),
    /** The link's secret, hashed: a link is found by it, and it never enters the trail. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    madeBy: text("made_by")
      .notNull()
      .references(() => user.id),
    madeAt: timestamp("made_at", { withTimezone: true }).notNull(),
    /** When it was last sent, and where each way went, mostly hidden: by email to `email`, by text to `phone`. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentByEmail: text("sent_by_email"),
    sentBySms: text("sent_by_sms"),
    /** Withdrawn by the Owner before it was used: it opens nothing from then on. */
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    withdrawnBy: text("withdrawn_by").references(() => user.id),
    /** When the Application it was made for was sent: used up, it opens nothing more. */
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** The key the person was given once they entered the code texted to the link's mobile, hashed, and until when it
     *  stands: with it they read their own name on the form, and send it. A sitting's, not the link's week. */
    openKeyHash: text("open_key_hash"),
    openKeyExpiresAt: timestamp("open_key_expires_at", { withTimezone: true }),
    /** When the link was first opened with its code: the Owner's list says so. */
    openedAt: timestamp("opened_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("application_link_token_uidx").on(table.tokenHash),
    index("application_link_phone_idx").on(table.farmId, table.phone),
    index("application_link_open_idx")
      .on(table.farmId, table.madeAt)
      .where(sql`${table.withdrawnAt} is null and ${table.usedAt} is null`),
  ]
);

/** What a code texted for a link is for: opening it, which proves the mobile is theirs, or agreeing the Portal Consent
 *  laid out from what they filled in, which is their signature on it (ADR 0034). */
export const APPLICATION_CODE_PURPOSES = ["open", "agree"] as const;
export type ApplicationCodePurpose = (typeof APPLICATION_CODE_PURPOSES)[number];

/** The codes last sent for a link, for one purpose: one by text to its mobile and another to its email, either of
 *  them good, so the one entered says which way it came — as a Signing Code's do (ADR 0022). Hashed, replaced by the
 *  next ones sent. With no text gateway yet, only the email's (the Owner, 2026-11-08). */
export const applicationCode = pgTable(
  "application_code",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    linkId: text("link_id")
      .notNull()
      .references(() => applicationLink.id),
    purpose: text("purpose", { enum: APPLICATION_CODE_PURPOSES }).notNull(),
    /** The code texted to the link's mobile, and where it went, mostly hidden; null when none was texted. */
    codeHash: text("code_hash"),
    sentTo: text("sent_to"),
    /** The code emailed to the link's email, and where it went, mostly hidden; null when none was emailed. */
    emailCodeHash: text("email_code_hash"),
    emailTo: text("email_to"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "application_code_went_somewhere",
      sql`${table.codeHash} is not null or ${table.emailCodeHash} is not null`
    ),
    uniqueIndex("application_code_link_purpose_uidx").on(
      table.linkId,
      table.purpose
    ),
  ]
);

/** The way a code came: by text to the link's mobile, or by email to its email. */
export const APPLICATION_CODE_CHANNELS = ["sms", "email"] as const;
export type ApplicationCodeChannel = (typeof APPLICATION_CODE_CHANNELS)[number];

/** Where an Application stands: waiting for the Owner, approved, declined, or lapsed, left undecided a month. */
export const APPLICATION_STATES = [
  "waiting",
  "approved",
  "declined",
  "lapsed",
] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

/**
 * An **Application**: what comes back from an Application Link, waiting for the Owner (ADR 0034). The Investor Details
 * Form's parts as the person filled them in, their mobile the link's; the Nominees they would name, not yet a
 * Nomination; and the Portal Consent agreed with a code texted to their mobile, kept with its proof — the paper laid
 * out from what they filled in, its fingerprint, which way the code came, from what address and browser. Approved, it
 * names the Investor it became. Declined or lapsed, what it holds about them is cleared a month later (`clearedAt`):
 * the name, mobile, dates and answer stay.
 */
export const investorApplication = pgTable(
  "investor_application",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    linkId: text("link_id")
      .notNull()
      .references(() => applicationLink.id),
    kind: text("kind", { enum: INVESTOR_KINDS }).notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address"),
    nid: text("nid"),
    bankAccount: text("bank_account"),
    tradeLicense: text("trade_license"),
    rjscNumber: text("rjsc_number"),
    tin: text("tin"),
    authority: text("authority"),
    authorityOn: text("authority_on"),
    signatoryName: text("signatory_name"),
    signatoryNid: text("signatory_nid"),
    signatoryRole: text("signatory_role"),
    /** The Nominees they would name, as the Nomination form sends them: a draft, in force only once signed. */
    nominees: jsonb("nominees").$type<unknown[]>(),
    /** The language they filled it in, which what the farm sends them is in. */
    language: text("language").notNull(),
    /** The Portal Consent they agreed: its wording's Version, and the paper laid out from what they filled in with its
     *  fingerprint. The paper is cleared with the rest of a declined one. */
    consentVersionId: text("consent_version_id")
      .notNull()
      .references(() => paperTemplateVersion.id),
    consentPaper: jsonb("consent_paper"),
    consentPaperHash: text("consent_paper_hash").notNull(),
    /** The proof of their agreeing: which way the code they entered came, where it went, mostly hidden, when it was
     *  sent, and from where they agreed. */
    codeChannel: text("code_channel", { enum: APPLICATION_CODE_CHANNELS })
      .notNull()
      .default("sms"),
    codeSentTo: text("code_sent_to").notNull(),
    codeSentAt: timestamp("code_sent_at", { withTimezone: true }).notNull(),
    callerAddress: text("caller_address"),
    callerAgent: text("caller_agent"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    state: text("state", { enum: APPLICATION_STATES })
      .notNull()
      .default("waiting"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    answeredBy: text("answered_by").references(() => user.id),
    /** The Owner's line to them, with a decline. */
    answerLine: text("answer_line"),
    /** The Investor an approved one became. */
    investorId: text("investor_id").references(() => investor.id),
    /** The Portal Consent an approved one recorded, agreed online on the day it was sent: how the farm proves that
     *  consent was given without a signature on paper (ADR 0034). */
    consentId: text("consent_id").references(() => portalConsent.id),
    /** When what it held about them was cleared, a month after it was declined or lapsed. */
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("investor_application_link_uidx").on(table.linkId),
    index("investor_application_state_idx").on(table.farmId, table.state),
    check(
      "investor_application_authority_on_day",
      sql`${table.authorityOn} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check(
      "investor_application_approved_names_investor",
      sql`(${table.state} = 'approved') = (${table.investorId} is not null)`
    ),
  ]
);

/** Which photograph an Application carries: the NID's two sides (a Signatory's for an Organization), and an
 *  Organization's trade license and the paper that authorizes its Signatory. */
export const APPLICATION_PHOTO_KINDS = [
  "nid_front",
  "nid_back",
  "trade_license",
  "authority",
] as const;
export type ApplicationPhotoKind = (typeof APPLICATION_PHOTO_KINDS)[number];

/** One photograph sent with an Application, kept apart from it so a list never carries the pictures. Downscaled on the
 *  phone before upload, base64. */
export const investorApplicationPhoto = pgTable(
  "investor_application_photo",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => investorApplication.id),
    what: text("what", { enum: APPLICATION_PHOTO_KINDS }).notNull(),
    contentType: text("content_type").notNull(),
    data: text("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("investor_application_photo_uidx").on(
      table.applicationId,
      table.what
    ),
  ]
);

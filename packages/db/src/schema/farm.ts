import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/** The single operating unit the system serves. Modelled so a second could exist later. */
export const farm = pgTable("farm", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Minutes of inactivity before a Shed Phone locks and asks for a PIN again. */
  pinAutoLockMinutes: integer("pin_auto_lock_minutes").notNull().default(5),
  /** How far the bulk total may sit from the sum of the per-cow records before the Manager
   *  is asked to look. */
  milkTolerancePercent: integer("milk_tolerance_percent").notNull().default(5),
  /** How far under its Feeding Target a Pen may come before the farm says so. Feed is
   *  weighed by eye more often than by scale, so this is wider than the milk tolerance. */
  feedTolerancePercent: integer("feed_tolerance_percent").notNull().default(10),
  /** When the day's quieter notices are carried, on the farm's own clock. */
  digestTimes: text("digest_times")
    .array()
    .notNull()
    .default(["06:00", "18:00"]),
  /** The farm is asleep between these, and nothing that can wait buzzes a phone. */
  quietFrom: text("quiet_from").notNull().default("22:00"),
  quietUntil: text("quiet_until").notNull().default("05:00"),
  /** How long an Overdue Instance may stay open before the Owner is told as well. */
  escalationMinutes: integer("escalation_minutes").notNull().default(120),
  /** How long after making an entry each Role may still put it right. The Owner and the Vet
   *  have no limit; these two do. */
  staffCorrectionHours: integer("staff_correction_hours").notNull().default(2),
  managerCorrectionDays: integer("manager_correction_days")
    .notNull()
    .default(30),
  /** How far a device's clock may differ from the farm's before its entries are flagged.
   *  Never a reason to refuse one: the entry is the record, and a wrong clock is a fact
   *  about the phone. */
  clockSkewMinutes: integer("clock_skew_minutes").notNull().default(15),
  /** Where the farm is, as the farm writes it. On the transport card a lorry carries and in the
   *  letter the office reads: both name the farm of origin, and a name alone is not a farm of
   *  origin. */
  address: text("address"),
  /** How the office, a buyer or a vet reaches the farm. */
  phone: text("phone"),
  /** The DLS registration: the number, the office that issued it, and when it runs out.
   *  Registration is one of the few hard legal duties, and its number goes on the transport card
   *  (Meat Rules 2021 r.18). The renewal SOP and the certificate photograph arrive with
   *  increment 7; the facts an inspector asks for first are here from the start. */
  registrationNumber: text("registration_number"),
  registrationOffice: text("registration_office"),
  registrationIssuedOn: timestamp("registration_issued_on"),
  registrationExpiresOn: timestamp("registration_expires_on"),
  /** How long before the registration runs out the farm starts saying so. The renewal SOP is
   *  raised on the same lead (increment 7), so a farm that has not been told by then is a farm
   *  finding out from an inspector. */
  registrationRenewalLeadDays: integer("registration_renewal_lead_days")
    .notNull()
    .default(90),
  /** What a bought-in fattening animal is fed towards unless the Manager says otherwise for
   *  that animal. One number for the farm; the spec's target weight "by class" waits for the
   *  farm to have enough Weigh-ins to tell the classes apart. */
  fatteningTargetWeightKg: integer("fattening_target_weight_kg")
    .notNull()
    .default(350),
  /** The hours after a Heat is seen within which a service takes: the AI work falls due at the
   *  first and is late after the second. How soon a technician reaches this farm is this farm's
   *  fact, so both are the Manager's to set. */
  aiWindowStartHours: integer("ai_window_start_hours").notNull().default(12),
  aiWindowEndHours: integer("ai_window_end_hours").notNull().default(18),
  /** How many days after an attempt's first service the Vet checks her, and how long a cow is
   *  carried. Both are the Manager's: when a vet can tell is a matter of the vet's hands and
   *  equipment, and gestation runs a little differently by breed. */
  pregnancyCheckAfterDays: integer("pregnancy_check_after_days")
    .notNull()
    .default(45),
  gestationDays: integer("gestation_days").notNull().default(283),
  /** How many days before she is expected to calve a milking cow is dried off, and a cow is walked
   *  to the calving pen. Every cow the same, so nobody counts days. */
  dryOffLeadDays: integer("dry_off_lead_days").notNull().default(60),
  calvingPrepLeadDays: integer("calving_prep_lead_days").notNull().default(7),
  /** How many attempts that did not take make a cow a Repeat Breeder somebody has to decide about. */
  repeatBreederThreshold: integer("repeat_breeder_threshold")
    .notNull()
    .default(3),
  /** What part of a Venture's target capital is the least worth starting on, as a percentage. A plan that
   *  raises less than this buys too few animals to be the run anybody signed for. */
  ventureFloorPercent: integer("venture_floor_percent").notNull().default(70),
  /** What part of a Venture's capital is kept back to feed and treat the animals, as a percentage; the
   *  rest is the Cattle Budget. */
  ventureRunningPercent: integer("venture_running_percent")
    .notNull()
    .default(25),
  /** The days after a Venture's Target Window in which it keeps selling before the Farm buys whatever is
   *  left, so the Venture settles on time. */
  windUpDays: integer("wind_up_days").notNull().default(30),
  /** The taka above which a Money Event the Owner did not enter waits for the Owner's approval. */
  approvalThresholdBdt: integer("approval_threshold_bdt")
    .notNull()
    .default(20_000),
  /** How far the Alert sweep has told people about. Everything that went late at or after
   *  this instant has been said; older work lives on the Overdue list, not in anyone's
   *  notifications. Null until the first sweep. */
  alertsSweptFrom: timestamp("alerts_swept_from"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ROLES = ["owner", "manager", "staff", "vet"] as const;
export type RoleName = (typeof ROLES)[number];

/** How much of the farm a Vet sees: all of it, or — a vet called in for a visit — only the animals on their cases. */
export const VET_SCOPES = ["full", "visiting"] as const;
export type VetScope = (typeof VET_SCOPES)[number];

/** One Role held by one person on one Farm. A person may hold several. */
export const roleAssignment = pgTable(
  "role_assignment",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull(),
    grantedBy: text("granted_by").references(() => user.id),
    /** The Role the granter acted under — audit attribution until Audit Events arrive. */
    grantedByRole: text("granted_by_role", { enum: ROLES }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Roles are never deleted; a revoked one keeps its history. */
    revokedAt: timestamp("revoked_at"),
    /** For the Vet role: "visiting" for a vet called in for a visit, who sees only the animals on their cases. Null
     *  is a full Vet. */
    scope: text("scope", { enum: VET_SCOPES }),
    /** When access granted for a visit ends. Null for a Role that does not run out. */
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    uniqueIndex("role_assignment_user_role_uidx").on(
      table.farmId,
      table.userId,
      table.role
    ),
    index("role_assignment_user_idx").on(table.userId),
  ]
);

/** The one definition of "a Role that counts": not revoked. Use in relational `where`s. */
export const ACTIVE_ROLE = { revokedAt: { isNull: true } } as const;

/**
 * A one-time code that lets somebody who has forgotten their password set a new one.
 *
 * Issued by whoever runs the farm and read out in person, because the people who need it are standing in the
 * same shed — and the farm has no email it can rely on reaching a milker. Only the hash is kept, as with an
 * invite's code, so a code cannot be read back out of the farm's own records; and only one is live per person,
 * because issuing a second should put the first out of use rather than leave two ways in.
 *
 * The password itself is never here. The code proves who is asking; Better Auth sets the password.
 */
export const passwordCode = pgTable(
  "password_code",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    issuedBy: text("issued_by")
      .notNull()
      .references(() => user.id),
    issuedByRole: text("issued_by_role", { enum: ROLES }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    /** When it was used, after which it is not a way in any more. */
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("password_code_user_uidx").on(table.userId)]
);

export const INVITE_STATUSES = ["pending", "approved", "revoked"] as const;

/** A person invited to the Farm with Roles to be granted when the invite is approved and
 *  the person exists. A Manager's invite waits for the Owner; an Owner's is approved at once. */
export const invite = pgTable(
  "invite",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    roles: text("roles", { enum: ROLES }).array().notNull(),
    status: text("status", { enum: INVITE_STATUSES })
      .notNull()
      .default("pending"),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id),
    invitedByRole: text("invited_by_role", { enum: ROLES }).notNull(),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at"),
    /** The one-time code the invited person enters to take up the invite, hashed. Handed over by whoever invited
     *  them, so an invite is taken up by the person it was given to — not by whoever signs up first with that email.
     *  Cleared once used. */
    codeHash: text("code_hash"),
    /** When the invited person took it up with the code. */
    acceptedAt: timestamp("accepted_at"),
    /** For a Vet invited for a visit: "visiting", and the day their access ends. */
    vetScope: text("vet_scope", { enum: VET_SCOPES }),
    accessUntil: timestamp("access_until"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("invite_email_idx").on(table.farmId, table.email)]
);

/**
 * A photograph of the farm's DLS Registration certificate: what an inspector asks to see first. Kept for
 * ever, one row per photograph, the newest being the certificate the farm holds now — a replaced photograph
 * is still the farm's evidence of what it held before.
 */
export const registrationCertificate = pgTable(
  "registration_certificate",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    /** Downscaled on the device before upload, base64. */
    data: text("data").notNull(),
    /** The renewal Step that took it, when a renewal did; null for one taken on the farm page. A corrected
     *  renewal replaces its own photograph rather than adding another. */
    completionId: text("completion_id"),
    takenBy: text("taken_by").references(() => user.id),
    takenAt: timestamp("taken_at").notNull(),
  },
  (table) => [
    index("registration_certificate_farm_idx").on(table.farmId, table.takenAt),
    uniqueIndex("registration_certificate_completion_uidx")
      .on(table.completionId)
      .where(sql`${table.completionId} is not null`),
  ]
);

/**
 * One renewal of the Registration, as the renewal SOP's closing Step recorded it: the expiry it replaced and
 * the new one. Keyed on the Completion, so a corrected renewal puts the same renewal right rather than
 * renewing twice, and knows what the expiry was before it.
 */
export const registrationRenewal = pgTable(
  "registration_renewal",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    completionId: text("completion_id").notNull(),
    previousExpiresOn: timestamp("previous_expires_on"),
    expiresOn: timestamp("expires_on").notNull(),
    renewedBy: text("renewed_by").references(() => user.id),
    renewedAt: timestamp("renewed_at").notNull(),
  },
  (table) => [
    uniqueIndex("registration_renewal_completion_uidx").on(table.completionId),
  ]
);

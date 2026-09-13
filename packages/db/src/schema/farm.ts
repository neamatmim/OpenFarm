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
  /** How far the Alert sweep has told people about. Everything that went late at or after
   *  this instant has been said; older work lives on the Overdue list, not in anyone's
   *  notifications. Null until the first sweep. */
  alertsSweptFrom: timestamp("alerts_swept_from"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ROLES = ["owner", "manager", "staff", "vet"] as const;
export type RoleName = (typeof ROLES)[number];

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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("invite_email_idx").on(table.farmId, table.email)]
);

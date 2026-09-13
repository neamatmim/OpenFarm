import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { shedPhone } from "./device";
import { ROLES, farm } from "./farm";
import { animal, pen } from "./herd";
import { MILK_DESTINATIONS } from "./milk-destinations";
import { sopDefinition, sopVersion } from "./sop";

export const INSTANCE_STATES = [
  "due",
  "in_progress",
  "completed",
  "approved",
  "sent_back",
  "missed",
] as const;

/**
 * One occurrence of an SOP falling due — "morning milking, Pen 1, 11 September". It pins the
 * Version it was raised from and finishes on it even if a newer Version is published
 * meanwhile (ADR 0001).
 */
export const sopInstance = pgTable(
  "sop_instance",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    definitionId: text("definition_id")
      .notNull()
      .references(() => sopDefinition.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => sopVersion.id),
    /** The Pen the work is in; null for work that concerns the whole farm rather than any Pen of it —
     *  the Registration's renewal, say. */
    penId: text("pen_id").references(() => pen.id, { onDelete: "cascade" }),
    state: text("state", { enum: INSTANCE_STATES }).notNull().default("due"),
    dueAt: timestamp("due_at").notNull(),
    graceMinutes: integer("grace_minutes").notNull(),
    /** The Role the Instance is assigned to, and optionally the person the Manager pinned. */
    assignedRole: text("assigned_role", { enum: ROLES }).notNull(),
    /** The Role that signs it off, pinned from the Version like everything else about the
     *  work. Null for an SOP nobody checks: that work is finished when it is completed. */
    checkerRole: text("checker_role", { enum: ROLES }),
    /** What raised this work, when it was not the clock: "move:<id>:+3", "state:<animal>:
     *  dry:<instant>". The farm never reads it; it is what stops the same Move raising the
     *  same check twice, however often the app is opened. Null for scheduled work, which is
     *  kept unique by its due time instead. */
    cause: text("cause"),
    /** The animal this work is about, for work something happened to one animal raised. Null
     *  for work that concerns the whole Pen. */
    animalId: text("animal_id").references(() => animal.id, {
      onDelete: "cascade",
    }),
    assignedTo: text("assigned_to").references(() => user.id),
    assignedBy: text("assigned_by").references(() => user.id),
    claimedBy: text("claimed_by").references(() => user.id),
    claimedAt: timestamp("claimed_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    /** One Instance per SOP, Pen and due time, however often the scheduler runs. Scheduled
     *  work only: two animals moved out of the same Pen in the same minute are two pieces of
     *  work, and their Instances are kept apart by their cause instead. */
    uniqueIndex("sop_instance_due_uidx")
      .on(table.definitionId, table.penId, table.dueAt)
      .where(sql`${table.cause} is null`),
    /** One Instance per SOP per cause: the same Move, seen again on the next app-open,
     *  raises nothing. */
    uniqueIndex("sop_instance_cause_uidx")
      .on(table.definitionId, table.cause)
      .where(sql`${table.cause} is not null`),
    index("sop_instance_open_idx").on(table.farmId, table.state, table.dueAt),
    index("sop_instance_pen_idx").on(table.farmId, table.penId, table.dueAt),
  ]
);

export const COMPLETION_STATUSES = ["done", "skipped"] as const;

/** The recorded act of doing one Step — once per animal where the Step repeats. */
export const stepCompletion = pgTable(
  "step_completion",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    instanceId: text("instance_id")
      .notNull()
      .references(() => sopInstance.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    /** Null for a Step that runs once for the whole Pen. */
    animalId: text("animal_id").references(() => animal.id, {
      onDelete: "cascade",
    }),
    /** `animalId`, or "" for a Step that runs once. Postgres treats NULLs as distinct, so a
     *  unique index over the nullable column would let a pen-level Step be recorded twice
     *  instead of corrected; this column gives the index something to bite on. */
    animalKey: text("animal_key").notNull().default(""),
    status: text("status", { enum: COMPLETION_STATUSES }).notNull(),
    /** Why an animal was skipped; one of the Version's skip reasons. */
    skipReason: text("skip_reason"),
    /** What was recorded, keyed by evidence index: a tick, a number, a choice, a note. */
    evidence: jsonb("evidence").notNull(),
    /** Set when a number fell outside its sane range and the person confirmed it anyway. */
    outOfRange: text("out_of_range"),
    /** Where the milk went, for a Step whose effect writes a Milk Record. Part of the act
     *  rather than of the Evidence, so a Correction can re-run the effect from the
     *  Completion alone. Null for every other Step. */
    destination: text("destination", { enum: MILK_DESTINATIONS }),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
    deviceId: text("device_id").references(() => shedPhone.id),
    /** When the person says they did it (their phone's clock, offline). */
    recordedAt: timestamp("recorded_at").notNull(),
    /** When the server accepted it — the authoritative order. */
    receivedAt: timestamp("received_at").notNull(),
  },
  (table) => [
    /** One Completion per Step per animal — or one for the whole Pen. Recording again
     *  corrects it rather than adding a row. */
    uniqueIndex("step_completion_uidx").on(
      table.instanceId,
      table.stepId,
      table.animalKey
    ),
    index("step_completion_instance_idx").on(table.instanceId),
  ]
);

/**
 * A photo taken as Evidence for a Step, against the slot of the Version that asked for it.
 * One Step may ask for more than one — the udder and the tag, say — and a photo that could
 * not say which it answered would be a photo nobody can read back.
 *
 * Its own row, and its own entry when it arrives from a phone (ADR 0002): a megabyte of
 * image should not be able to hold up a morning's litres.
 */
export const completionPhoto = pgTable(
  "completion_photo",
  {
    completionId: text("completion_id")
      .notNull()
      .references(() => stepCompletion.id, { onDelete: "cascade" }),
    /** Which Evidence of the Step this answers, by its place in the Version. */
    slot: integer("slot").notNull().default(0),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    data: text("data").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.completionId, table.slot] }),
    index("completion_photo_idx").on(table.completionId),
  ]
);

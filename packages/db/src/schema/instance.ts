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
import { shedPhone } from "./device";
import { ROLES, farm } from "./farm";
import { animal, pen } from "./herd";
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
    penId: text("pen_id")
      .notNull()
      .references(() => pen.id, { onDelete: "cascade" }),
    state: text("state", { enum: INSTANCE_STATES }).notNull().default("due"),
    dueAt: timestamp("due_at").notNull(),
    graceMinutes: integer("grace_minutes").notNull(),
    /** The Role the Instance is assigned to, and optionally the person the Manager pinned. */
    assignedRole: text("assigned_role", { enum: ROLES }).notNull(),
    assignedTo: text("assigned_to").references(() => user.id),
    assignedBy: text("assigned_by").references(() => user.id),
    claimedBy: text("claimed_by").references(() => user.id),
    claimedAt: timestamp("claimed_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    /** One Instance per SOP, Pen and due time, however often the scheduler runs. */
    uniqueIndex("sop_instance_due_uidx").on(
      table.definitionId,
      table.penId,
      table.dueAt
    ),
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

/** A photo taken as Evidence for a Step. */
export const completionPhoto = pgTable("completion_photo", {
  completionId: text("completion_id")
    .primaryKey()
    .references(() => stepCompletion.id, { onDelete: "cascade" }),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

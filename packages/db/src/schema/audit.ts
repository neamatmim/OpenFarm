import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";

export const AUDIT_ACTIONS = [
  "create",
  "update",
  "correct",
  "export",
  "login",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Append-only. One row per state change, written in the same transaction as the change.
 *  A Correction is an event with action "correct", a reason, and `supersedes_id` pointing at
 *  the event whose `after` it replaces — the original stays readable there. */
export const auditEvent = pgTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    /** Null only for the handful of events before a Farm exists (e.g. a language choice on first run). */
    farmId: text("farm_id").references(() => farm.id),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action", { enum: AUDIT_ACTIONS }).notNull(),
    actorId: text("actor_id").references(() => user.id),
    roleUsed: text("role_used", { enum: ROLES }),
    deviceId: text("device_id"),
    deviceSeq: integer("device_seq"),
    /** When the actor says it happened (device clock for offline entries). */
    recordedAt: timestamp("recorded_at").notNull(),
    /** When the server accepted it — the authoritative audit order. */
    receivedAt: timestamp("received_at").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    supersedesId: text("supersedes_id"),
  },
  (table) => [
    index("audit_event_entity_idx").on(
      table.farmId,
      table.entity,
      table.entityId
    ),
    index("audit_event_actor_idx").on(
      table.farmId,
      table.actorId,
      table.receivedAt
    ),
    index("audit_event_received_idx").on(table.farmId, table.receivedAt),
    index("audit_event_entity_received_idx").on(
      table.farmId,
      table.entity,
      table.receivedAt
    ),
  ]
);

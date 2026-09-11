import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { ALERT_KINDS } from "./alert-kinds";
import { user } from "./auth";
import { farm } from "./farm";

export { ALERT_KINDS } from "./alert-kinds";
export type { AlertKind } from "./alert-kinds";

/**
 * One thing one person is being told, in app. It stays visible until they dismiss it — an
 * Alert is not a transient toast but the farm's way of saying something is waiting. Web push
 * (a later ticket) delivers these; it does not replace them.
 */
export const alert = pgTable(
  "alert",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Who is being told. One row per recipient: an Alert is personal. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ALERT_KINDS }).notNull(),
    /** What it is about — "sop_instance" and its id — so the Alert can link to the work. */
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    /** What the message needs, snapshotted: the SOP's name, the Pen, a send-back reason.
     *  Held rather than joined so the notice still reads as it did when it was raised. */
    params: jsonb("params").notNull(),
    createdAt: timestamp("created_at").notNull(),
    dismissedAt: timestamp("dismissed_at"),
  },
  (table) => [
    /** One Alert per person per thing per kind: the sweep that raises them runs as often as
     *  anyone opens the app, and must not pile up duplicates. */
    uniqueIndex("alert_once_uidx").on(table.userId, table.kind, table.entityId),
    index("alert_inbox_idx").on(
      table.userId,
      table.dismissedAt,
      table.createdAt
    ),
  ]
);

import {
  boolean,
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
    /** When this was carried in a Digest. Null for one still waiting, and for the immediate
     *  ones that never travel that way. */
    carriedAt: timestamp("carried_at"),
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

/**
 * One text message the farm sent, or tried to.
 *
 * Two jobs, both of them the reason this table exists rather than a counter in a log. It is the
 * farm's evidence that it told the people it is supposed to tell — these are the two notices
 * that cost money or break a legal deadline, and "we did text you" should not rest on anybody's
 * memory. And it is how the farm knows it has already said this: a notice reaches the app for
 * every person it concerns, but one Withdrawal ending is one thing to be texted about, not one
 * per person who happens to be told in the app.
 */
export const textMessage = pgTable(
  "text_message",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ALERT_KINDS }).notNull(),
    /** What it was about — the same thing the Alert is about. */
    entityId: text("entity_id").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** The number as the farm had it written down when it sent. */
    sentTo: text("sent_to").notNull(),
    /** What the gateway said. False is kept too: a message that did not go is the thing worth
     *  knowing. */
    delivered: boolean("delivered").notNull(),
    sentAt: timestamp("sent_at").notNull(),
  },
  (table) => [
    /** One message per person per thing. Said once, however many times the farm is told. */
    uniqueIndex("text_message_once_uidx").on(
      table.userId,
      table.kind,
      table.entityId
    ),
    index("text_message_farm_idx").on(table.farmId, table.sentAt),
  ]
);

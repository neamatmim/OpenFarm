import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { shedPhone } from "./device";
import { farm } from "./farm";

/**
 * One browser that has agreed to be told things: its push endpoint and the keys that let
 * only this farm speak to it.
 *
 * Per browser, not per person — a Manager with a phone and an office machine has two, and
 * an Alert should reach both. A Shed Phone's subscription is tied to the phone, so removing
 * the phone takes its voice with it.
 */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Set when the browser is a Shed Phone, so revoking the phone revokes this too. */
    deviceId: text("device_id").references(() => shedPhone.id, {
      onDelete: "cascade",
    }),
    /** Where the push service takes a message for this browser. */
    endpoint: text("endpoint").notNull(),
    /** The browser's own keys. Without them a message cannot be encrypted to it. */
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull(),
    /** Set when the browser said it no longer wants to hear, or the push service said it is
     *  gone. Kept rather than deleted: who was told what, and who stopped being told, is
     *  part of the farm's record. */
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    /** One row per endpoint per Farm: a browser that subscribes twice is one browser, and
     *  one Farm's rows are not another Farm's to write over. */
    uniqueIndex("push_endpoint_uidx").on(table.farmId, table.endpoint),
    index("push_user_idx").on(table.farmId, table.userId, table.revokedAt),
  ]
);

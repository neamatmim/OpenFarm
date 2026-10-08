import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";
import { shed } from "./herd";

/** A farm-provided phone kept in a Shed. It holds a device token; people are identified on
 *  it by PIN Switch, never by the device itself (ADR 0003). */
export const shedPhone = pgTable(
  "shed_phone",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    shedId: text("shed_id").references(() => shed.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    /** Hash of the device token; the token itself is shown once and lives on the phone. */
    tokenHash: text("token_hash").notNull(),
    /** One-time code the Manager reads out to the phone; cleared once it is claimed. */
    enrollmentCode: text("enrollment_code"),
    enrollmentExpiresAt: timestamp("enrollment_expires_at", {
      withTimezone: true,
    }),
    enrolledBy: text("enrolled_by").references(() => user.id),
    enrolledByRole: text("enrolled_by_role", { enum: ROLES }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("shed_phone_token_uidx").on(table.tokenHash),
    uniqueIndex("shed_phone_code_uidx").on(table.enrollmentCode),
    index("shed_phone_farm_idx").on(table.farmId),
  ]
);

/** A Staff member's PIN, as a salt and a derived hash. Synced to enrolled phones so PIN
 *  Switch works offline; the PIN itself is never stored or sent. */
export const staffPin = pgTable(
  "staff_pin",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    salt: text("salt").notNull(),
    hash: text("hash").notNull(),
    setBy: text("set_by").references(() => user.id),
    setByRole: text("set_by_role", { enum: ROLES }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("staff_pin_user_farm_uidx").on(table.userId, table.farmId),
  ]
);

/**
 * Proof that someone entered their PIN on a phone. The phone sends this token instead of
 * naming a person, so the active user cannot be asserted by whoever holds a device token.
 * It expires after the farm's auto-lock window and is refreshed by use.
 */
export const deviceSwitch = pgTable(
  "device_switch",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => shedPhone.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** When the stint was ended on purpose — the phone locked, the person's PIN set anew — rather than run out. Ended, it
     *  is never opened again: work recorded before it still proves its person, nothing after it, and no later entry or
     *  keep-awake stretches it. Null for a stint still open or one that ran out. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("device_switch_token_uidx").on(table.tokenHash),
    index("device_switch_device_idx").on(table.deviceId, table.expiresAt),
  ]
);

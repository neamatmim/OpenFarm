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
    enrolmentCode: text("enrolment_code"),
    enrolmentExpiresAt: timestamp("enrolment_expires_at"),
    enrolledBy: text("enrolled_by").references(() => user.id),
    enrolledByRole: text("enrolled_by_role", { enum: ROLES }),
    claimedAt: timestamp("claimed_at"),
    lastSeenAt: timestamp("last_seen_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("shed_phone_token_uidx").on(table.tokenHash),
    index("shed_phone_farm_idx").on(table.farmId),
  ]
);

/** A Staff member's PIN, as a salt and a derived hash. Synced to enrolled phones so PIN
 *  Switch works offline; the PIN itself is never stored or sent. */
export const staffPin = pgTable("staff_pin", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  salt: text("salt").notNull(),
  hash: text("hash").notNull(),
  setBy: text("set_by").references(() => user.id),
  setByRole: text("set_by_role", { enum: ROLES }),
  updatedAt: timestamp("updated_at").notNull(),
});

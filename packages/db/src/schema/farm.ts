import {
  index,
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

/** Which Pens a Staff person is responsible for. Pens themselves arrive with the herd
 *  register; until then `penId` is an opaque identifier without a foreign key. */
export const penAssignment = pgTable(
  "pen_assignment",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    penId: text("pen_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pen_assignment_user_pen_uidx").on(table.userId, table.penId),
  ]
);

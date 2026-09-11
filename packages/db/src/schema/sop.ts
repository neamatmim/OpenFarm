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
import { ROLES, farm } from "./farm";

/** The Playbook entry: a procedure the farm expects staff to follow. The Definition is the
 *  thing that persists; what it *says* lives in immutable Versions (ADR 0001). */
export const sopDefinition = pgTable(
  "sop_definition",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** The Version in force. Null only between creating a Definition and publishing its first. */
    currentVersionId: text("current_version_id"),
    /** Set when the Owner retires an SOP; history and past Instances stay. */
    retiredAt: timestamp("retired_at"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("sop_definition_farm_idx").on(table.farmId)]
);

/**
 * One published, immutable statement of an SOP. Rows are never updated: changing an SOP
 * publishes the next Version, and an Instance records the Version it started on, so the
 * farm can always show what procedure was in force on a given day (ADR 0001).
 */
export const sopVersion = pgTable(
  "sop_version",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    definitionId: text("definition_id")
      .notNull()
      .references(() => sopDefinition.id, { onDelete: "cascade" }),
    /** 1, 2, 3 … within the Definition. */
    number: integer("number").notNull(),
    content: jsonb("content").notNull(),
    /** Why this Version exists — the Owner's note, or the Manager's proposal note. */
    note: text("note"),
    publishedBy: text("published_by").references(() => user.id),
    publishedByRole: text("published_by_role", { enum: ROLES }),
    publishedAt: timestamp("published_at").notNull(),
  },
  (table) => [
    uniqueIndex("sop_version_number_uidx").on(table.definitionId, table.number),
  ]
);

export const PROPOSAL_STATUSES = ["pending", "approved", "rejected"] as const;

/** A Manager's suggested change, waiting for the Owner. Approving it publishes a Version. */
export const sopProposal = pgTable(
  "sop_proposal",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    definitionId: text("definition_id")
      .notNull()
      .references(() => sopDefinition.id, { onDelete: "cascade" }),
    /** The Version this was drafted against, so the Owner can see what has moved since. */
    basedOnVersionId: text("based_on_version_id").references(
      () => sopVersion.id
    ),
    content: jsonb("content").notNull(),
    note: text("note"),
    status: text("status", { enum: PROPOSAL_STATUSES })
      .notNull()
      .default("pending"),
    proposedBy: text("proposed_by").references(() => user.id),
    proposedByRole: text("proposed_by_role", { enum: ROLES }),
    decidedBy: text("decided_by").references(() => user.id),
    decidedAt: timestamp("decided_at"),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("sop_proposal_status_idx").on(table.farmId, table.status)]
);

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

/** The kinds of paper a Template words. Mirrored in @OpenFarm/domain; the db package depends on nothing. */
export const TEMPLATE_KINDS = [
  "investment_agreement",
  "master_agreement",
  "venture_schedule",
  "agreement_amendment",
  "portal_consent",
  "privacy_notice",
  "nomination",
] as const;

/**
 * The farm's wording for one kind of paper an Investor signs or is handed. One per kind: the farm starts from OpenFarm's standard
 * wording and the Owner changes it by publishing the next Version, never by rewriting one.
 */
export const paperTemplate = pgTable(
  "paper_template",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: TEMPLATE_KINDS }).notNull(),
    /** The Version papers are printed from now. */
    currentVersionId: text("current_version_id"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("paper_template_kind_uidx").on(table.farmId, table.kind),
  ]
);

/**
 * One published wording of a Template. Its content is never updated: an Agreement records the Version it was signed
 * under, so the farm can always print what a man put his name to. That a lawyer approved it is the one thing written
 * onto a Version afterwards — once, by the Owner, with the lawyer's name and the day.
 */
export const paperTemplateVersion = pgTable(
  "paper_template_version",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => paperTemplate.id, { onDelete: "cascade" }),
    /** 1, 2, 3 … within the Template. */
    number: integer("number").notNull(),
    content: jsonb("content").notNull(),
    /** Why this Version exists, in the Owner's words; the standard wording says so of itself. */
    note: text("note"),
    /** Nobody, for the standard wording the farm was given. */
    publishedBy: text("published_by").references(() => user.id),
    publishedByRole: text("published_by_role", { enum: ROLES }),
    publishedAt: timestamp("published_at").notNull(),
    /** The lawyer who approved this wording, and the day they did — as the Owner wrote it down. */
    reviewedBy: text("reviewed_by"),
    reviewedOn: text("reviewed_on"),
    reviewRecordedBy: text("review_recorded_by").references(() => user.id),
  },
  (table) => [
    uniqueIndex("paper_template_version_number_uidx").on(
      table.templateId,
      table.number
    ),
    index("paper_template_version_farm_idx").on(table.farmId),
  ]
);

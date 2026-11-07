import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";
import { INVESTOR_KINDS } from "./venture";

/**
 * An **Application Link**: the Owner's invitation to one person they know to fill in their own details online, in
 * place of the Investor Details Form filled in at a meeting (ADR 0034). Made for a name, a mobile, an email and whether
 * they are a person or an Organization; only that mobile is sent the code that opens it. Good for a week and one
 * Application, and the Owner may withdraw one not yet used. The link itself is shown once and kept only as a hash.
 */
export const applicationLink = pgTable(
  "application_link",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: INVESTOR_KINDS }).notNull(),
    /** Who the Owner made it for: a person's name, or an Organization's, as the Owner knows them. */
    name: text("name").notNull(),
    /** The mobile the code that opens it goes to, and that they sign in to the portal with once approved: for an
     *  Organization, its Signatory's. */
    phone: text("phone").notNull(),
    /** Where the Owner emails it: lowercased, as typed. Null for a link the Owner only texts or copies. */
    email: text("email"),
    /** The link's secret, hashed: a link is found by it, and it never enters the trail. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    madeBy: text("made_by")
      .notNull()
      .references(() => user.id),
    madeAt: timestamp("made_at", { withTimezone: true }).notNull(),
    /** When it was last sent, and where each way went, mostly hidden: by email to `email`, by text to `phone`. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentByEmail: text("sent_by_email"),
    sentBySms: text("sent_by_sms"),
    /** Withdrawn by the Owner before it was used: it opens nothing from then on. */
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    withdrawnBy: text("withdrawn_by").references(() => user.id),
    /** When the Application it was made for was sent: used up, it opens nothing more. */
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("application_link_token_uidx").on(table.tokenHash),
    index("application_link_phone_idx").on(table.farmId, table.phone),
    index("application_link_open_idx")
      .on(table.farmId, table.madeAt)
      .where(sql`${table.withdrawnAt} is null and ${table.usedAt} is null`),
  ]
);

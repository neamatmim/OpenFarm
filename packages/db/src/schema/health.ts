import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";

/**
 * One product on the farm's Drug List, with the days its milk and its meat must be withheld.
 *
 * There is no national withdrawal table for cattle in Bangladesh: the days come off the
 * product's own label and the prescribing Vet's judgement, so this list is the only place
 * they exist — and it is the farm's evidence at slaughter, where the vet may ask for the
 * prescription and the withdrawal period of anything given in the last thirty days.
 *
 * The days may be blank, because a Manager buys a product on a day the Vet is not there and
 * the farm should write down what it owns. Blank means it cannot be prescribed: a treatment
 * that starts without a known Withdrawal is milk nobody can say is safe.
 */
export const drugProduct = pgTable(
  "drug_product",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    nameBn: text("name_bn").notNull(),
    nameEn: text("name_en"),
    /** Days after the last Treatment before her milk may go to Bulk again. */
    milkWithdrawalDays: integer("milk_withdrawal_days"),
    /** Days after the last Treatment before she may be sold for meat. */
    meatWithdrawalDays: integer("meat_withdrawal_days"),
    /** Who last said what the days are, and when. The days are evidence, so their author is. */
    daysSetBy: text("days_set_by").references(() => user.id),
    daysSetAt: timestamp("days_set_at"),
    /** Retired, never removed: a Treatment given last March still names its product. */
    retiredAt: timestamp("retired_at"),
    addedBy: text("added_by").references(() => user.id),
    addedByRole: text("added_by_role", { enum: ROLES }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("drug_product_name_uidx").on(table.farmId, table.nameBn),
    index("drug_product_farm_idx").on(table.farmId),
  ]
);

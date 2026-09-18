import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";

/**
 * Where a Venture is in its life. Open while the Agreements are signed and the capital arrives; Buying once
 * the Owner says the Floor is met; Fattening when they are all bought; Selling from its first Sale; Settled
 * when the last payout is made. Cancelled is where an under-funded one ends, with every taka refunded.
 */
export const VENTURE_STATES = [
  "open",
  "buying",
  "fattening",
  "selling",
  "settled",
  "cancelled",
] as const;
export type VentureState = (typeof VENTURE_STATES)[number];

/**
 * One investor-funded run of fattening cattle, from the first Investment Agreement to the last payout.
 *
 * It carries the plan it opened on and nothing it has since done: what it holds, what it has spent and what
 * it has paid out are read from the movements of its own money, never stored here.
 */
export const venture = pgTable(
  "venture",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    state: text("state", { enum: VENTURE_STATES }).notNull().default("open"),
    /** What the Owner is looking to raise, and the least it is worth starting on. */
    targetCapitalBdt: numeric("target_capital_bdt", {
      precision: 12,
      scale: 2,
    }).notNull(),
    floorBdt: numeric("floor_bdt", { precision: 12, scale: 2 }).notNull(),
    /** The day the Floor must be met by, as a calendar names it. */
    decideBy: text("decide_by").notNull(),
    /** The period the Venture means to sell in; its Animals inherit it. */
    targetWindowStart: text("target_window_start").notNull(),
    targetWindowEnd: text("target_window_end").notNull(),
    /** What one Unit costs, and how many there are. An Investor holds whole Units. */
    unitPriceBdt: numeric("unit_price_bdt", {
      precision: 12,
      scale: 2,
    }).notNull(),
    units: integer("units").notNull(),
    /** The part of the capital meant for buying animals; the rest is the Running Budget. */
    cattleBudgetBdt: numeric("cattle_budget_bdt", {
      precision: 12,
      scale: 2,
    }).notNull(),
    /** Why a Venture was called off, in the Owner's words. */
    cancelledReason: text("cancelled_reason"),
    openedBy: text("opened_by").references(() => user.id),
    openedByRole: text("opened_by_role", { enum: ROLES }).notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("venture_state_idx").on(table.farmId, table.state)]
);

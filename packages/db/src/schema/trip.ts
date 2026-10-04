import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";
import { numericMoney } from "./numeric-columns";

// The farm's outings have a module of their own because they belong to nobody in particular: a Trip may
// carry the Farm's animals and two Ventures', and both the fattening records and a Venture's money point
// at one. Keeping them clear of the herd is also what lets a Venture Movement name the outing it funded
// without the schema going round in a circle.

/**
 * One outing to buy cattle, with what it cost beyond the animals' prices: the broker, the lorry home, and
 * keeping the men who went. Split evenly across the Animals whose Intakes name it, because the lorry was
 * hired for all of them; the Market toll is not, because a livestock market takes that per animal.
 */
export const buyingTrip = pgTable(
  "buying_trip",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Where it went, as the farm says it: a livestock market's name, or a village's. */
    wentTo: text("went_to").notNull(),
    /** What the broker took for finding the animals. */
    brokerMoney: numericMoney("broker_money").notNull().default(0),
    /** The lorry home. */
    transportMoney: numericMoney("transport_money").notNull().default(0),
    /** Keeping the men who went: their food, and a night's lodging when the livestock market runs late. */
    keepMoney: numericMoney("keep_money").notNull().default(0),
    wentOn: timestamp("went_on", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** When the Farm's own Buying Float for this outing was counted home, and by whom; nothing while it is out, or
     *  for an outing no Farm float went on. */
    floatReconciledAt: timestamp("float_reconciled_at", { withTimezone: true }),
    floatReconciledBy: text("float_reconciled_by").references(() => user.id),
  },
  (table) => [index("buying_trip_day_idx").on(table.farmId, table.wentOn)]
);

/**
 * One outing to sell cattle, with what the day cost: the lorry both ways, the stall or the space, and
 * keeping the men who went. Split evenly across every Animal taken — sold or brought home again, because a
 * bull that came back still stood on the lorry.
 *
 * Not a **Load**, which is one vehicle to one destination and what a Transport Card describes.
 */
export const sellingTrip = pgTable(
  "selling_trip",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Where it went, as the farm says it. */
    wentTo: text("went_to").notNull(),
    /** The lorry, both ways. */
    transportMoney: numericMoney("transport_money").notNull().default(0),
    /** The stall or the space, and keeping the men who went. */
    keepMoney: numericMoney("keep_money").notNull().default(0),
    wentOn: timestamp("went_on", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("selling_trip_day_idx").on(table.farmId, table.wentOn)]
);

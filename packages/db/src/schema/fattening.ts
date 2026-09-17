import {
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";
import { animal } from "./herd";
import { stepCompletion } from "./instance";

/**
 * A person or business the Farm buys from, sells to, or pays.
 *
 * One table rather than a seller column here and a buyer column there, because it is the same
 * trader either way: the man who sells the farm a bull in Savar is often the man who buys one
 * back at Eid, and a farm that writes his name twice cannot see that.
 */
export const counterparty = pgTable(
  "counterparty",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Where he is, as the farm would say it aloud — a hat, a village, a district. */
    address: text("address"),
    phone: text("phone"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // The same trader, named the same way, is one trader. Recorded once per Farm.
    uniqueIndex("counterparty_name_uidx").on(table.farmId, table.name),
  ]
);

/**
 * One outing to buy cattle, with what it cost beyond the animals' prices: the broker, the lorry home, and
 * keeping the men who went. Split evenly across the Animals whose Intakes name it, because the lorry was
 * hired for all of them; the Hasil is not, because a haat takes that per animal.
 */
export const buyingTrip = pgTable(
  "buying_trip",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Where it went, as the farm says it: a haat's name, or a village's. */
    wentTo: text("went_to").notNull(),
    /** What the broker took for finding the animals. */
    brokerBdt: numeric("broker_bdt", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /** The lorry home. */
    transportBdt: numeric("transport_bdt", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /** Keeping the men who went: their food, and a night's lodging when the haat runs late. */
    keepBdt: numeric("keep_bdt", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    wentOn: timestamp("went_on").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("buying_trip_day_idx").on(table.farmId, table.wentOn)]
);

/**
 * The recorded arrival of a bought-in Animal on the Fattening side.
 *
 * One per Animal: an animal arrives once. What it cost and what it weighed on the day are facts
 * about that arrival and never change, which is why they live here rather than on the Animal —
 * the Animal's weight today is a Weigh-in's business.
 */
export const intake = pgTable(
  "intake",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    /** Who the farm bought it from. Null for an animal whose seller nobody wrote down. */
    counterpartyId: text("counterparty_id").references(() => counterparty.id),
    /** The outing she came home on, when she came home on one. Null for an animal bought at the farm
     *  gate, or one nobody wrote a Trip for. */
    buyingTripId: text("buying_trip_id").references(() => buyingTrip.id),
    /** What the farm paid, in taka. One of the two money events in a fattening animal's life. */
    purchasePriceBdt: numeric("purchase_price_bdt", {
      precision: 12,
      scale: 2,
    }).notNull(),
    /** The toll the haat took on this beast, as its slip gives it. Part of what she cost the farm and
     *  charged to her alone, because a haat takes it per animal and often on her price. Zero for one
     *  bought at the farm gate, and for one born here. */
    hasilBdt: numeric("hasil_bdt", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /** What it weighed when it came off the lorry: the first point every gain is measured from. */
    weightKg: numeric("weight_kg", { precision: 7, scale: 2 }).notNull(),
    /** Months, as the seller says and the Manager judges. Nobody has a bought-in bull's papers. */
    estimatedAgeMonths: integer("estimated_age_months").notNull(),
    /** The period the farm intends to sell it in — days, as a calendar names them, because Eid
     *  is a date in a calendar and not an instant on a clock. */
    targetWindowStart: text("target_window_start").notNull(),
    targetWindowEnd: text("target_window_end").notNull(),
    /** What it is being fed towards. Defaulted from the Farm Parameter; per animal, because a
     *  small bull bought cheap is not being fed to the same weight as a big one. */
    targetWeightKg: numeric("target_weight_kg", {
      precision: 7,
      scale: 2,
    }).notNull(),
    arrivedAt: timestamp("arrived_at").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("intake_animal_uidx").on(table.animalId),
    index("intake_window_idx").on(table.farmId, table.targetWindowStart),
  ]
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
    transportBdt: numeric("transport_bdt", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /** The stall or the space, and keeping the men who went. */
    keepBdt: numeric("keep_bdt", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    wentOn: timestamp("went_on").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("selling_trip_day_idx").on(table.farmId, table.wentOn)]
);

/**
 * One Animal taken on one Selling Trip. A recorded fact and never derived from who sold: the lorry carried
 * her whether or not anybody bought her, and that is what her share is for.
 */
export const sellingTripAnimal = pgTable(
  "selling_trip_animal",
  {
    sellingTripId: text("selling_trip_id")
      .notNull()
      .references(() => sellingTrip.id, { onDelete: "cascade" }),
    /** No cascade, as the Vet Fee's animals have none: an Animal removed would silently re-split a cost
     *  the farm has already paid and already booked. */
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id),
  },
  (table) => [primaryKey({ columns: [table.sellingTripId, table.animalId] })]
);

/** How a weight was arrived at. A crush scale today; a girth tape, if the farm ever falls back
 *  to one, is recorded as an estimate so nobody reads it as a measurement. */
export const WEIGH_METHODS = ["scale"] as const;

/**
 * A recorded scale reading for one Animal on a date.
 *
 * Kept for ever and never overwritten: the whole of fattening is the difference between two of
 * these, and a farm that keeps only the latest has thrown away everything it was measuring.
 * Keyed on the Step Completion, so a phone replaying its outbox or a Manager correcting an entry
 * replaces the reading rather than adding a second one (ADR 0002).
 */
export const weighIn = pgTable(
  "weigh_in",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    completionId: text("completion_id")
      .notNull()
      .references(() => stepCompletion.id, { onDelete: "cascade" }),
    weightKg: numeric("weight_kg", { precision: 7, scale: 2 }).notNull(),
    method: text("method", { enum: WEIGH_METHODS }).notNull().default("scale"),
    /** What the farm found doubtful about this reading, in its own words, and null for one it
     *  did not doubt. The reading is kept either way: the barn wrote it down (ADR 0002). */
    flaggedNote: text("flagged_note"),
    weighedAt: timestamp("weighed_at").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("weigh_in_completion_uidx").on(table.completionId),
    index("weigh_in_animal_idx").on(table.animalId, table.weighedAt),
  ]
);

/** Why the farm suggested an Animal. Its own copy, as `SIDES` and `ANIMAL_STATES` are: this
 *  package depends on nothing, and the domain keeps the rule that reads it. */
export const READY_REASONS = ["weight", "window"] as const;

/**
 * The Manager has looked at an Animal the farm suggested and decided she is staying.
 *
 * Kept so the farm stops shouting about her: a suggestion that returns every morning after it has
 * been answered is a suggestion nobody reads. One row per Animal — a second look replaces the
 * first, because what matters is the last thing the Manager decided about her.
 */
export const readySetAside = pgTable(
  "ready_set_aside",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    /** The grounds the Manager was looking at when they decided she is staying. A ground that
     *  was not among them is something new, and worth raising again. */
    grounds: text("grounds", { enum: READY_REASONS }).array().notNull(),
    /** Why she is staying, in the Manager's own words. A queue cleared without a word is a
     *  queue nobody can audit. */
    reason: text("reason").notNull(),
    setAsideBy: text("set_aside_by").references(() => user.id),
    setAsideAt: timestamp("set_aside_at").notNull(),
  },
  (table) => [uniqueIndex("ready_set_aside_animal_uidx").on(table.animalId)]
);

/**
 * An Animal leaving the farm to a buyer: who took her, for how much, what she weighed on the
 * day, and what carried her.
 *
 * One per Animal, because an animal leaves once. A cull that ends at a butcher is one of these
 * and not a Mortality (the Owner's decision, 2026-09-12): the Manager decides at the time, and
 * the reason she was culled goes in this record's own note. One exit, one record.
 *
 * The transport details are not decoration: the Meat Rules 2021 r.18 transport card is made from
 * them and from the farm's own Registration, and a lorry stopped without one is the farm's
 * problem rather than the driver's.
 */
export const sale = pgTable(
  "sale",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    /** Who took her. The same Counterparty the farm buys from, on the other side of the deal. */
    counterpartyId: text("counterparty_id")
      .notNull()
      .references(() => counterparty.id),
    priceBdt: numeric("price_bdt", { precision: 12, scale: 2 }).notNull(),
    /** What she weighed on the day. Not her last Weigh-in: a beast loses weight on a lorry and
     *  the price was struck on this figure. */
    weightKg: numeric("weight_kg", { precision: 7, scale: 2 }).notNull(),
    /** Where she was going, and what took her there. */
    destination: text("destination").notNull(),
    vehicle: text("vehicle").notNull(),
    driver: text("driver").notNull(),
    /** Anything the farm wants said about why she went — a culled cow's reason lives here. */
    note: text("note"),
    soldAt: timestamp("sold_at").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sale_animal_uidx").on(table.animalId),
    index("sale_day_idx").on(table.farmId, table.soldAt),
  ]
);

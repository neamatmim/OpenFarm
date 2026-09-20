import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";
import { counterparty } from "./fattening";
import { pen } from "./herd";
import { taka } from "./taka";

/** Something the Farm feeds, in kilos. Home-grown fodder is a Feed Item too. Retired rather
 *  than removed: a Ration the farm fed in March still names it. */
export const feedItem = pgTable(
  "feed_item",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    nameBn: text("name_bn").notNull(),
    nameEn: text("name_en"),
    /** What it is measured in. Kilos unless the farm says otherwise — straw comes in bales
     *  and molasses in litres, and a Ration line means whatever this says. */
    unit: text("unit").notNull().default("kg"),
    /** Below this much on hand, the Manager is told. Null for a Feed Item nobody watches. */
    lowStockAt: numeric("low_stock_at", { precision: 12, scale: 1 }),
    /** What a kilo of this is worth when the farm grows it itself: roughly what buying it would cost.
     *  A Harvest comes into the store at it, so the animals that eat home-grown fodder are charged for
     *  it. Null for anything the farm does not grow, which comes in at what it was bought for. */
    fodderPriceBdt: taka("fodder_price_bdt"),
    retiredAt: timestamp("retired_at"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [uniqueIndex("feed_item_name_uidx").on(table.farmId, table.nameBn)]
);

/**
 * A named list of what animals are fed in a day, assigned to whichever Pens are on it — the
 * three milking pens are usually on one Ration, and changing it should be one change, not
 * three that can quietly drift apart.
 *
 * What it *says* lives in immutable Versions, like an SOP (ADR 0001): changing a Ration
 * publishes the next one, so what a Pen was fed in March can still be shown in June.
 */
export const ration = pgTable(
  "ration",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    nameBn: text("name_bn").notNull(),
    nameEn: text("name_en"),
    currentVersionId: text("current_version_id"),
    retiredAt: timestamp("retired_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [uniqueIndex("ration_name_uidx").on(table.farmId, table.nameBn)]
);

/** Which Ration a Pen is on. One at a time; changing it is a fact the trail records. */
export const penRation = pgTable("pen_ration", {
  penId: text("pen_id")
    .primaryKey()
    .references(() => pen.id, { onDelete: "cascade" }),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  rationId: text("ration_id")
    .notNull()
    .references(() => ration.id, { onDelete: "cascade" }),
  assignedBy: text("assigned_by").references(() => user.id),
  assignedAt: timestamp("assigned_at").notNull(),
});

/** One published statement of a Ration. Never updated: the next change is the next Version. */
export const rationVersion = pgTable(
  "ration_version",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    rationId: text("ration_id")
      .notNull()
      .references(() => ration.id, { onDelete: "cascade" }),
    /** 1, 2, 3 … within the Ration. */
    number: integer("number").notNull(),
    /**
     * [{ feedItemId, kgPerAnimalPerDay }] — what one animal gets in a day. How often that day's
     * worth is split into buckets is the feeding SOP's schedule, not the recipe's business: a
     * Ration saying twice a day beside an SOP raised three times would feed every bucket at
     * two thirds, and the working would still read "÷ 2 a day".
     */
    items: jsonb("items").notNull(),
    note: text("note"),
    publishedBy: text("published_by").references(() => user.id),
    publishedByRole: text("published_by_role", { enum: ROLES }),
    publishedAt: timestamp("published_at").notNull(),
  },
  (table) => [
    uniqueIndex("ration_version_number_uidx").on(table.rationId, table.number),
    /** The Version in force at a given moment, which is what in-flight work reads. */
    index("ration_version_at_idx").on(table.rationId, table.publishedAt),
  ]
);

/**
 * The recorded act of feeding one Pen in one session: what each Feed Item was owed, what was
 * actually given, and anything left in the trough from last time. Written by the Step that
 * did it, in the Completion's own transaction.
 *
 * Stock on Hand is taken off the back of these: what was given is what left the store. A Feeding
 * is also the farm's record that the animals were fed, and the first place a pen off its feed
 * shows up.
 */
export const feeding = pgTable(
  "feeding",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    instanceId: text("instance_id").notNull(),
    completionId: text("completion_id").notNull(),
    penId: text("pen_id")
      .notNull()
      .references(() => pen.id, { onDelete: "cascade" }),
    /** The Ration Version this session was worked out from, pinned for ever (ADR 0001). */
    rationVersionId: text("ration_version_id")
      .notNull()
      .references(() => rationVersion.id),
    /** The animals standing in the Pen when it was fed, and how often that day's ration is
     *  split — both kept, so the arithmetic can still be shown a year later. */
    animals: integer("animals").notNull(),
    sessionsPerDay: integer("sessions_per_day").notNull(),
    /** [{ feedItemId, targetKg, givenKg, leftoverKg }] */
    lines: jsonb("lines").notNull(),
    /** How far under target the whole session came, and when that was worth saying. */
    shortfallPercent: integer("shortfall_percent").notNull().default(0),
    flaggedAt: timestamp("flagged_at"),
    fedBy: text("fed_by").references(() => user.id),
    fedAt: timestamp("fed_at").notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    index("feeding_pen_idx").on(table.farmId, table.penId, table.fedAt),
    /** One Feeding per Completion: a replayed entry is the same meal. */
    uniqueIndex("feeding_completion_uidx").on(table.completionId),
  ]
);

/** How feed reaches the store: bought from somebody, or cut from the farm's own fields. */
export const FEED_IN_KINDS = ["purchase", "harvest"] as const;

/**
 * Feed coming into the store: a Purchase from a supplier at a price, or a Harvest from the farm's own
 * fields at none.
 *
 * With the Feedings that take it back out, this is what Stock on Hand is worked out from — it is never
 * typed — and a purchase's price is what the Feed Item's weighted-average price is worked out from.
 */
export const feedIn = pgTable(
  "feed_in",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    feedItemId: text("feed_item_id")
      .notNull()
      .references(() => feedItem.id),
    kind: text("kind", { enum: FEED_IN_KINDS }).notNull(),
    /** In the Feed Item's own unit. */
    quantity: numeric("quantity", { precision: 12, scale: 1 }).notNull(),
    /** What the whole lot cost, in taka. Null for a harvest. */
    priceBdt: taka("price_bdt"),
    /** The seller: who the farm bought it from, as on an Intake. Null for a harvest. */
    counterpartyId: text("counterparty_id").references(() => counterparty.id),
    /** The farm's day it came in. */
    receivedOn: timestamp("received_on").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    index("feed_in_item_idx").on(
      table.farmId,
      table.feedItemId,
      table.receivedOn
    ),
  ]
);

/**
 * One Feed Item as a Stock Count found it: what the store was thought to hold at that moment, what was
 * really there, and — when they differ — why.
 *
 * The count wins: Stock on Hand reads from it afterwards. A difference is an adjustment with its
 * reason, never quietly absorbed. Written by the Step that counted, keyed on its Completion and the
 * Feed Item, so a corrected count re-books its difference rather than adding another.
 */
export const stockCount = pgTable(
  "stock_count",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    feedItemId: text("feed_item_id")
      .notNull()
      .references(() => feedItem.id),
    completionId: text("completion_id").notNull(),
    countedAt: timestamp("counted_at").notNull(),
    /** What the store was thought to hold, just before this count. */
    expected: numeric("expected", { precision: 12, scale: 1 }).notNull(),
    counted: numeric("counted", { precision: 12, scale: 1 }).notNull(),
    /** Why what was counted is not what was expected. Null when they match. */
    reason: text("reason"),
    countedBy: text("counted_by").references(() => user.id),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    uniqueIndex("stock_count_line_uidx").on(
      table.completionId,
      table.feedItemId
    ),
    index("stock_count_item_idx").on(
      table.farmId,
      table.feedItemId,
      table.countedAt
    ),
  ]
);

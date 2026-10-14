import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  index,
  check,
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
import { sopInstance, stepCompletion } from "./instance";
import { numericMoney } from "./numeric-columns";
import { supplierInvoice } from "./supplier";

/** What a Feed Item is counted in. Its own copy, as `SIDES` and `ANIMAL_STATES` are: this package depends on
 *  nothing, and the domain keeps the rules that read it — a test holds the two the same. */
export const FEED_UNITS = ["kg", "liter", "bundle"] as const;

/** What feed bought other than in its own unit came as: bags, or a trader's maunds. */
export const FEED_PACKS = ["bag", "maund"] as const;

/** Something the Farm feeds, counted in kilos, liters or bundles. Home-grown fodder is a Feed Item too. Retired
 *  rather than removed: a Ration the farm fed in March still names it. */
export const feedItem = pgTable(
  "feed_item",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    nameBn: text("name_bn").notNull(),
    nameEn: text("name_en"),
    /** What it is counted in: kilos unless the farm says otherwise — molasses in liters, napier cut in bundles —
     *  and a Ration line, a purchase and a count all mean whatever this says. */
    unit: text("unit", { enum: FEED_UNITS }).notNull().default("kg"),
    /** What one of this feed's bags weighs, in kilos, for buying it by the bag. Null until the farm says. */
    bagSizeKg: numeric("bag_size_kg", { precision: 8, scale: 1 }),
    /** Below this much on hand, the Manager is told. Null for a Feed Item nobody watches. */
    lowStockAt: numeric("low_stock_at", { precision: 12, scale: 1 }),
    /** What a kilo of this is worth when the farm grows it itself: roughly what buying it would cost.
     *  A Harvest comes into the store at it, so the animals that eat home-grown fodder are charged for
     *  it. Null for anything the farm does not grow, which comes in at what it was bought for. */
    fodderPriceMoney: numericMoney("fodder_price_money"),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
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
    currentVersionId: text("current_version_id").references(
      // A Ration and its Versions point at each other; the reference is only read once both are made.
      // oxlint-disable-next-line no-use-before-define
      (): AnyPgColumn => rationVersion.id
    ),
    /** The weights it is written for — a grower's 150 to 250 kg — so a bull grown out of it, or one too small for it,
     *  is pointed out to be moved. On the Ration rather than a Version: it says who should eat it, not what they are
     *  fed, and moving it rewrites no Feeding. Null at either end for an end left open. */
    weightFromKg: numeric("weight_from_kg", { precision: 7, scale: 1 }),
    weightToKg: numeric("weight_to_kg", { precision: 7, scale: 1 }),
    /** Its Expected Gain: the kilos a day, low to high, it is written to put on the animals that eat it — so a bull
     *  gaining under it is pointed out. On the Ration beside its band, for the same reason; both or neither. */
    expectedGainLowKg: numeric("expected_gain_low_kg", {
      precision: 4,
      scale: 2,
    }),
    expectedGainHighKg: numeric("expected_gain_high_kg", {
      precision: 4,
      scale: 2,
    }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("ration_name_uidx").on(table.farmId, table.nameBn)]
);

/** Which Ration a Pen is on. One at a time; changing it is a fact the trail records. */
export const penRation = pgTable("pen_ration", {
  penId: text("pen_id")
    .primaryKey()
    .references(() => pen.id),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  rationId: text("ration_id")
    .notNull()
    .references(() => ration.id),
  assignedBy: text("assigned_by").references(() => user.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull(),
});

/**
 * Each time a Pen was on a Ration, from when to when — the Pen's own Ration history. A Feeding is read against the
 * Ration in force when its work was raised; with only the Ration the Pen is on now, a meal written down — or put right —
 * after the Pen moved Ration was read against the new one, and the feed it was given dropped out of the store and the
 * costs. Written by putting a Pen on a Ration; the spell open now has no end.
 */
export const penRationSpell = pgTable(
  "pen_ration_spell",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    penId: text("pen_id")
      .notNull()
      .references(() => pen.id),
    rationId: text("ration_id")
      .notNull()
      .references(() => ration.id),
    from: timestamp("from", { withTimezone: true }).notNull(),
    until: timestamp("until", { withTimezone: true }),
  },
  (table) => [index("pen_ration_spell_pen_idx").on(table.penId, table.from)]
);

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
      .references(() => ration.id),
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
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
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
    instanceId: text("instance_id")
      .notNull()
      .references(() => sopInstance.id),
    completionId: text("completion_id")
      .notNull()
      .references(() => stepCompletion.id),
    penId: text("pen_id")
      .notNull()
      .references(() => pen.id),
    /** The Ration Version this session was worked out from, pinned for ever (ADR 0001). */
    rationVersionId: text("ration_version_id")
      .notNull()
      .references(() => rationVersion.id),
    /** The animals standing in the Pen when it was fed, and how often that day's ration is
     *  split — both kept, so the arithmetic can still be shown a year later. */
    animals: integer("animals").notNull(),
    /** What the Pen weighed as its Ration's lines by weight were worked out from — every animal's latest weight,
     *  the unweighed at the average of the rest. Null where nobody in it had been weighed, and for every Feeding
     *  from before a Ration could go by weight. */
    herdWeightKg: numeric("herd_weight_kg", { precision: 9, scale: 1 }),
    sessionsPerDay: integer("sessions_per_day").notNull(),
    /** [{ feedItemId, targetKg, givenKg, leftoverKg }] */
    lines: jsonb("lines").notNull(),
    /** How far under target the whole session came, and when that was worth saying. */
    shortfallPercent: integer("shortfall_percent").notNull().default(0),
    flaggedAt: timestamp("flagged_at", { withTimezone: true }),
    fedBy: text("fed_by").references(() => user.id),
    fedAt: timestamp("fed_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("feeding_pen_idx").on(table.farmId, table.penId, table.fedAt),
    /** One Feeding per Completion: a replayed entry is the same meal. */
    uniqueIndex("feeding_completion_uidx").on(table.completionId),
  ]
);

export const FEED_ORDER_STATES = [
  "requested",
  "approved",
  "ordered",
  "rejected",
  "cancelled",
  "closed",
] as const;

/** One feed per request. Approval fixes its quantity and spending ceiling; corrections to arrivals remain visible
 * through their live totals. A request or order never creates stock or a money event. */
export const feedPurchaseOrder = pgTable(
  "feed_purchase_order",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    feedItemId: text("feed_item_id")
      .notNull()
      .references(() => feedItem.id),
    counterpartyId: text("counterparty_id")
      .notNull()
      .references(() => counterparty.id),
    assignedTo: text("assigned_to")
      .notNull()
      .references(() => user.id),
    quantity: numeric("quantity", { precision: 12, scale: 1 }).notNull(),
    unitPriceMoney: numericMoney("unit_price_money").notNull(),
    budgetMoney: numericMoney("budget_money").notNull(),
    neededOn: text("needed_on").notNull(),
    leadDays: integer("lead_days").notNull(),
    bufferDays: integer("buffer_days").notNull(),
    creditDays: integer("credit_days").notNull().default(0),
    forecast: jsonb("forecast"),
    note: text("note"),
    state: text("state", { enum: FEED_ORDER_STATES })
      .notNull()
      .default("requested"),
    version: integer("version").notNull().default(1),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    orderedBy: text("ordered_by").references(() => user.id),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    orderReference: text("order_reference"),
    deliveryDueOn: text("delivery_due_on"),
    endedBy: text("ended_by").references(() => user.id),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason"),
  },
  (table) => [
    check(
      "feed_purchase_order_quantity_not_negative",
      sql`${table.quantity} >= 0`
    ),
    check(
      "feed_purchase_order_unit_price_money_not_negative",
      sql`${table.unitPriceMoney} >= 0`
    ),
    check(
      "feed_purchase_order_budget_money_not_negative",
      sql`${table.budgetMoney} >= 0`
    ),
    check(
      "feed_purchase_order_lead_days_not_negative",
      sql`${table.leadDays} >= 0`
    ),
    check(
      "feed_purchase_order_buffer_days_not_negative",
      sql`${table.bufferDays} >= 0`
    ),
    check(
      "feed_purchase_order_credit_days_not_negative",
      sql`${table.creditDays} >= 0`
    ),
    check(
      "feed_order_credit_days_check",
      sql`${table.creditDays} BETWEEN 0 AND 365`
    ),
    index("feed_purchase_order_farm_idx").on(
      table.farmId,
      table.state,
      table.neededOn
    ),
    index("feed_purchase_order_item_idx").on(table.farmId, table.feedItemId),
    check(
      "feed_purchase_order_terms_ck",
      sql`${table.quantity} > 0 and ${table.unitPriceMoney} > 0 and ${table.budgetMoney} >= round(${table.quantity} * ${table.unitPriceMoney}, 2) and ${table.leadDays} between 0 and 90 and ${table.bufferDays} between 0 and 30`
    ),
    check(
      "feed_purchase_order_state_known",
      sql`${table.state} in ('requested', 'approved', 'ordered', 'rejected', 'cancelled', 'closed')`
    ),
  ]
);

/** How feed reaches the store: bought from somebody, cut from the farm's own fields, or made on the farm from other
 *  feed — a **Feed Making**'s made feed, which only that Making brings in. */
export const FEED_IN_KINDS = ["purchase", "harvest", "made"] as const;

/**
 * A **Feed Making**: one Feed Item made on the farm from others — a home-mixed concentrate, or silage packed into a pit
 * or bags. Its inputs (`feedMakingInput`) leave the store the moment it was made; what it made comes in as a Feed In of
 * kind `made` — the same moment for a mix, the day the pit is opened for silage — worth what went into it, worked out
 * from the store every time it is read and never typed (ADR 0030). A transfer inside the store: it books no money.
 */
export const feedMaking = pgTable(
  "feed_making",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** What it makes: the Feed Item its made feed comes into the store as. */
    outputFeedItemId: text("output_feed_item_id")
      .notNull()
      .references(() => feedItem.id),
    /** The farm's day it was mixed or packed: its inputs left the store then. */
    madeOn: timestamp("made_on", { withTimezone: true }).notNull(),
    /** For silage: the farm day it should be ready to open, as the person packing it said. Nothing for a mix. */
    readyOn: text("ready_on"),
    /** Which pit or which bags, as the farm calls them. */
    note: text("note"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("feed_making_farm_idx").on(table.farmId, table.madeOn),
    index("feed_making_output_idx").on(table.farmId, table.outputFeedItemId),
  ]
);

/** One Feed Item a Feed Making took out of the store, in that feed's own unit. */
export const feedMakingInput = pgTable(
  "feed_making_input",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    feedMakingId: text("feed_making_id")
      .notNull()
      .references(() => feedMaking.id, { onDelete: "cascade" }),
    feedItemId: text("feed_item_id")
      .notNull()
      .references(() => feedItem.id),
    quantity: numeric("quantity", { precision: 12, scale: 1 }).notNull(),
  },
  (table) => [
    uniqueIndex("feed_making_input_item_uidx").on(
      table.feedMakingId,
      table.feedItemId
    ),
    index("feed_making_input_item_idx").on(table.farmId, table.feedItemId),
    check(
      "feed_making_input_quantity_not_negative",
      sql`${table.quantity} >= 0`
    ),
  ]
);

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
    /** An ordered delivery, recorded once through the normal store and spending books. */
    purchaseOrderId: text("purchase_order_id").references(
      (): AnyPgColumn => feedPurchaseOrder.id
    ),
    /** The Feed Making whose made feed this is: set exactly for kind `made`, and once — a Making brings its feed in
     *  once. */
    feedMakingId: text("feed_making_id").references(() => feedMaking.id),
    supplierInvoiceId: text("supplier_invoice_id").references(
      () => supplierInvoice.id
    ),
    /** Null preserves the historical fully-paid purchase. An invoice records exactly what was paid at delivery, including zero. */
    paidAtDeliveryMoney: numericMoney("paid_at_delivery_money"),
    /** In the Feed Item's own unit: what the farm's scale showed where it was weighed, else what the slip said. What
     *  the store holds, and what its price per unit is read on. */
    quantity: numeric("quantity", { precision: 12, scale: 1 }).notNull(),
    /** What the seller's slip said — typed, or its bags at the feed's bag weight, or its maunds — where the lot was
     *  also weighed on the farm's scale; nothing where it was not, and no difference is claimed. */
    slipQuantity: numeric("slip_quantity", { precision: 12, scale: 1 }),
    /** What it was bought as, where not in the feed's own unit: so many bags or maunds, which `quantity` holds in
     *  kilos. Kept so the arrival reads as the trader's slip did; cleared when a Correction puts the quantity right. */
    packKind: text("pack_kind", { enum: FEED_PACKS }),
    packCount: numeric("pack_count", { precision: 10, scale: 1 }),
    /** What the whole lot cost, in taka. A harvest's is its Fodder Price's worth, null while it has none; made feed's
     *  is always null here, as it is worked out from what went into it each time the store is read. */
    priceMoney: numericMoney("price_money"),
    /** The seller: who the farm bought it from, as on an Intake. Null for a harvest. */
    counterpartyId: text("counterparty_id").references(() => counterparty.id),
    /** The farm's day it came in. */
    receivedOn: timestamp("received_on", { withTimezone: true }).notNull(),
    /** The Lot Number on the bag, where there is one — bagged concentrate and premix carry one, hay and a
     *  harvest do not. */
    lotNumber: text("lot_number"),
    /** The last day the bag says it may be fed, as the farm's own day, where it says one. */
    expiresOn: text("expires_on"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "feed_in_paid_at_delivery_money_not_negative",
      sql`${table.paidAtDeliveryMoney} >= 0`
    ),
    index("feed_in_item_idx").on(
      table.farmId,
      table.feedItemId,
      table.receivedOn
    ),
    index("feed_in_order_idx").on(table.farmId, table.purchaseOrderId),
    index("feed_in_invoice_idx").on(table.farmId, table.supplierInvoiceId),
    uniqueIndex("feed_in_making_uidx").on(table.feedMakingId),
    check(
      "feed_in_made_by_a_making",
      sql`(${table.kind} = 'made') = (${table.feedMakingId} IS NOT NULL)`
    ),
    check(
      "feed_in_payment_check",
      sql`(${table.supplierInvoiceId} IS NULL AND ${table.paidAtDeliveryMoney} IS NULL) OR (${table.supplierInvoiceId} IS NOT NULL AND ${table.kind} = 'purchase' AND ${table.priceMoney} IS NOT NULL AND ${table.paidAtDeliveryMoney} IS NOT NULL AND ${table.paidAtDeliveryMoney} >= 0 AND ${table.paidAtDeliveryMoney} <= ${table.priceMoney})`
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
    completionId: text("completion_id")
      .notNull()
      .references(() => stepCompletion.id),
    countedAt: timestamp("counted_at", { withTimezone: true }).notNull(),
    /** What the store was thought to hold, just before this count. */
    expected: numeric("expected", { precision: 12, scale: 1 }).notNull(),
    counted: numeric("counted", { precision: 12, scale: 1 }).notNull(),
    /** Why what was counted is not what was expected. Null when they match. */
    reason: text("reason"),
    countedBy: text("counted_by").references(() => user.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
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

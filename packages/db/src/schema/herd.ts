import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";

export const SIDES = ["dairy", "fattening"] as const;
export const ANIMAL_STATES = [
  "calf",
  "heifer",
  "pregnant_heifer",
  "milking",
  "dry",
  "quarantine",
  "fattening",
  "ready_for_sale",
  "sold",
  "died",
  "culled",
] as const;
export const ANIMAL_SOURCES = ["born", "bought"] as const;
export const SEXES = ["female", "male"] as const;

/** A building on the Farm containing Pens. */
export const shed = pgTable(
  "shed",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("shed_name_uidx").on(table.farmId, table.name)]
);

/** A physical enclosure inside a Shed. Every Animal is in exactly one Pen. */
export const pen = pgTable(
  "pen",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    shedId: text("shed_id")
      .notNull()
      .references(() => shed.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("pen_name_uidx").on(table.shedId, table.name)]
);

/** The next Tag Number per prefix. Sequences never rewind, so numbers are never reused. */
export const tagSequence = pgTable(
  "tag_sequence",
  {
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    prefix: text("prefix", { enum: ["D", "F"] }).notNull(),
    next: integer("next").notNull().default(1),
  },
  (table) => [uniqueIndex("tag_sequence_uidx").on(table.farmId, table.prefix)]
);

/** One individual head of cattle, from arrival or birth until sale or death. */
export const animal = pgTable(
  "animal",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Permanent identity: prefix by Side of origin, never reused, unchanged on Side change. */
    tagNumber: text("tag_number").notNull(),
    /** Any government or pilot-scheme tag. An attribute, never the identity. */
    officialTag: text("official_tag"),
    /** Marks the animal carried before the farm's own numbering (kept from the opening register). */
    aliases: text("aliases").array().notNull().default([]),
    sex: text("sex", { enum: SEXES }).notNull(),
    side: text("side", { enum: SIDES }).notNull(),
    state: text("state", { enum: ANIMAL_STATES }).notNull(),
    penId: text("pen_id")
      .notNull()
      .references(() => pen.id),
    source: text("source", { enum: ANIMAL_SOURCES }).notNull(),
    breed: text("breed"),
    birthDate: timestamp("birth_date"),
    /** Set when a photo exists; the client uses it to bust its cache. */
    photoUpdatedAt: timestamp("photo_updated_at"),
    /** The lactation in progress: its number, and when it began. Derived from the lifecycle
     *  — set when a cow enters Milking — never typed. Breeding (increment 5) writes these
     *  from Calving instead. */
    lactationNumber: integer("lactation_number").notNull().default(0),
    lactationStartedAt: timestamp("lactation_started_at"),
    /** While this is in the future, the cow's milk may not go to Bulk. Health (increment 3)
     *  writes it from a Treatment; until then it is the hook the gate reads. */
    milkWithdrawalUntil: timestamp("milk_withdrawal_until"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("animal_tag_uidx").on(table.farmId, table.tagNumber),
    index("animal_pen_idx").on(table.farmId, table.penId),
    index("animal_side_state_idx").on(table.farmId, table.side, table.state),
  ]
);

/** The recorded event of an Animal changing Pen — including a change of Side. */
export const animalMove = pgTable(
  "animal_move",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    fromPenId: text("from_pen_id").references(() => pen.id),
    toPenId: text("to_pen_id")
      .notNull()
      .references(() => pen.id),
    fromSide: text("from_side", { enum: SIDES }),
    toSide: text("to_side", { enum: SIDES }).notNull(),
    reason: text("reason"),
    movedBy: text("moved_by").references(() => user.id),
    movedAt: timestamp("moved_at").notNull(),
  },
  (table) => [index("animal_move_animal_idx").on(table.animalId, table.movedAt)]
);

/** Replacing a lost or unreadable Ear Tag. The Tag Number is unchanged. */
export const retag = pgTable(
  "retag",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    retaggedBy: text("retagged_by").references(() => user.id),
    retaggedAt: timestamp("retagged_at").notNull(),
  },
  (table) => [index("retag_animal_idx").on(table.animalId, table.retaggedAt)]
);

/** The Animal's profile photo, shown wherever an animal is picked. One per Animal. */
export const animalPhoto = pgTable("animal_photo", {
  animalId: text("animal_id")
    .primaryKey()
    .references(() => animal.id, { onDelete: "cascade" }),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  /** Downscaled on the device before upload; base64 so it survives the offline outbox. */
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

/** Which Pens a Staff person is responsible for. */
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
    penId: text("pen_id")
      .notNull()
      .references(() => pen.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pen_assignment_user_pen_uidx").on(table.userId, table.penId),
  ]
);

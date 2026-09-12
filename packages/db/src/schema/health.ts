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
import { animal } from "./herd";
import { observation } from "./observation";

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

/**
 * The Vet's recorded conclusion about what an Animal has — **Vet only**, and never recorded
 * on their behalf: antibiotics require a registered practitioner's own prescription (BVC Act
 * 2019), so the act has to be theirs in the record as well as in law.
 *
 * It may answer an Observation, which is how the farm's health chain holds together: what the
 * round saw, what the Vet made of it, and what was done about it. It may also stand alone —
 * the Vet comes for something else and finds this.
 *
 * The disease is named in the Vet's own words. A Diagnosis of a Notifiable Disease must be
 * reported to DLS without delay; matching these words against the farm's notifiable list is
 * the report's own work, not this table's.
 */
export const diagnosis = pgTable(
  "diagnosis",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    /** The Observation it answers, when the Vet is answering the round. */
    observationId: text("observation_id").references(() => observation.id),
    /** What the Vet concluded she has, in their own words. The glossary's word for the
     *  thing itself is Disease; the record of concluding it is the Diagnosis. */
    disease: text("disease").notNull(),
    diseaseEn: text("disease_en"),
    /** What they found: the clinical detail behind the conclusion. */
    note: text("note"),
    /** The Vet. Not nullable: a Diagnosis with nobody's name on it is not a Diagnosis. */
    diagnosedBy: text("diagnosed_by")
      .notNull()
      .references(() => user.id),
    /** The farm's clock, not the phone's — the clinical record's own order. */
    diagnosedAt: timestamp("diagnosed_at").notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    index("diagnosis_animal_idx").on(table.animalId, table.diagnosedAt),
    /** The herd health summary: everything diagnosed lately, whatever animal. */
    index("diagnosis_farm_idx").on(table.farmId, table.diagnosedAt),
    /** Which Observations the Vet has answered, and which are still waiting. */
    index("diagnosis_observation_idx").on(table.observationId),
  ]
);

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
import { sopInstance, stepCompletion } from "./instance";
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

/** How a dose goes in — the routes a Vet writes on a prescription. Said here as well as in
 *  the domain because this package does not depend on that one; keep the two in step. */
export const ROUTES = [
  "intramuscular",
  "intravenous",
  "subcutaneous",
  "oral",
  "intramammary",
  "topical",
] as const;

/**
 * The Vet's order for one Animal: drug, dose, route, frequency, duration — **Vet only**, and
 * only from a product whose withdrawal days are known, because a course that starts without
 * them is milk nobody can say is safe.
 *
 * It answers a Diagnosis: a course of antibiotics is given *for* something the Vet concluded,
 * and the animal's page reads the whole chain — what the round saw, what the Vet made of it,
 * what was ordered, and which doses were actually given.
 *
 * The farm turns it into work: one Treatment per dose, each on its own Instance of the
 * Treatment SOP, so a dose nobody gave is Overdue beside a milking nobody did.
 */
export const prescription = pgTable(
  "prescription",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    /** What it treats. A Prescription for nothing in particular is not one. */
    diagnosisId: text("diagnosis_id")
      .notNull()
      .references(() => diagnosis.id),
    productId: text("product_id")
      .notNull()
      .references(() => drugProduct.id),
    /** How much, in the Vet's own words — "১০ মিলি". Not a number: the unit is the
     *  product's, and a bare figure would be the farm guessing which. */
    dose: text("dose").notNull(),
    route: text("route", { enum: ROUTES }).notNull(),
    /** The times of day each dose falls due, on the farm's clock, and for how many days. */
    times: text("times").array().notNull(),
    days: integer("days").notNull(),
    prescribedBy: text("prescribed_by")
      .notNull()
      .references(() => user.id),
    prescribedAt: timestamp("prescribed_at").notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    index("prescription_animal_idx").on(table.animalId, table.prescribedAt),
    index("prescription_farm_idx").on(table.farmId, table.prescribedAt),
    index("prescription_diagnosis_idx").on(table.diagnosisId),
  ]
);

/**
 * One dose: what was owed, and — once somebody records giving it — who gave it and when.
 * **The last one given starts the Withdrawal**, so this is the row the farm's milk and meat
 * gates are answerable to.
 *
 * Two ways a dose reaches an animal, and one table, because a slaughter vet asking what she
 * has been given does not care which:
 *
 * - **a dose of a Prescription**: the row exists from the moment the Vet writes the course,
 *   because a dose the farm has not given yet is still a dose it owes — that is what makes a
 *   missed one visible as work nobody did;
 * - **a dose of a campaign**: a vaccination or a deworming over a Pen, where the row is
 *   written by the Step that gave it, animal by animal, and nothing was owed beforehand.
 *
 * `givenAt` separates owed from given. A Correction that turns "gave it" back into "skipped"
 * clears it again — nothing is deleted, and the Instance is still there to say what was asked
 * for.
 */
export const treatment = pgTable(
  "treatment",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** The course this dose belongs to. Null for a campaign, which nobody prescribed. */
    prescriptionId: text("prescription_id").references(() => prescription.id, {
      onDelete: "cascade",
    }),
    /** What was given. Kept here rather than read back through the Prescription: what went
     *  into the animal is the Treatment's own fact, and it is what the Withdrawal is worked
     *  out from. */
    productId: text("product_id")
      .notNull()
      .references(() => drugProduct.id),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    /** The work this dose was given under. */
    instanceId: text("instance_id")
      .notNull()
      .references(() => sopInstance.id, { onDelete: "cascade" }),
    /** Which dose of the course this is — 1 of 6 — so the farm can say where it got to. One
     *  for a campaign, which gives each animal a single dose. */
    number: integer("number").notNull(),
    dueAt: timestamp("due_at").notNull(),
    /** The Step that recorded giving it. Null until somebody does. */
    completionId: text("completion_id").references(() => stepCompletion.id, {
      onDelete: "set null",
    }),
    givenBy: text("given_by").references(() => user.id),
    givenAt: timestamp("given_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    /** One dose per animal per piece of work: a Prescription's Instance is about one animal,
     *  and a campaign's covers the Pen one animal at a time. This is what keeps a dose from
     *  being recorded twice however often a phone sends it. */
    uniqueIndex("treatment_dose_uidx").on(table.instanceId, table.animalId),
    /** The withdrawal question: what has this animal been given, and when was the last one. */
    index("treatment_animal_idx").on(table.animalId, table.givenAt),
    index("treatment_prescription_idx").on(table.prescriptionId, table.number),
  ]
);

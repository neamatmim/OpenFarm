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
import { animal } from "./herd";
import { stepCompletion } from "./instance";
import { observation } from "./observation";

/** How a cow is served. Its own copy, as the schema's other enums are: this package depends on
 *  nothing, and the domain keeps the rules that read it. */
export const SERVICE_METHODS = ["ai", "natural"] as const;
export const PREGNANCY_CHECK_RESULTS = ["positive", "negative"] as const;
export const CALVING_EASES = ["unassisted", "assisted", "vet"] as const;

/**
 * A cow served: how, by which sire, by whom, and in answer to which Heat.
 *
 * The event the rest of the breeding chain counts from — the Pregnancy Check falls due from it,
 * Expected Calving is worked out from it, and a run of failed ones makes a Repeat Breeder — so it
 * is exact about the instant, and it is recorded by the Step that did the work rather than typed
 * somewhere afterwards. Keyed on that Step Completion, so a phone replaying the entry or a Manager
 * correcting it replaces this Service rather than adding a second.
 */
export const service = pgTable(
  "service",
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
    method: text("method", { enum: SERVICE_METHODS }).notNull(),
    /** The straw's number, for AI. Null for a natural service. */
    sireStraw: text("sire_straw"),
    /** The farm's own bull, for a natural service. Null for AI. */
    sireAnimalId: text("sire_animal_id").references(() => animal.id),
    /** Who actually served her — a technician or a vet, rarely somebody with an account. */
    servedBy: text("served_by"),
    /** The Heat this service answered, when it was raised by one. How her page reads as a chain. */
    heatId: text("heat_id").references(() => observation.id),
    servedAt: timestamp("served_at").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    /** The Role the Service belongs to — always the Manager's — kept on the record because the
     *  Step it came through may have run under another Role the same person holds. */
    recordedByRole: text("recorded_by_role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("service_completion_uidx").on(table.completionId),
    index("service_animal_idx").on(table.animalId, table.servedAt),
  ]
);

/**
 * What the Vet found when she was checked: whether the attempt a Service began has taken.
 *
 * Of the attempt, not of one service: a cow served twice in one heat is checked once, and the check
 * points at the first service, which is where Expected Calving counts from. Keyed on the Step
 * Completion, as the Service is, so a correction replaces the finding rather than adding a second.
 * A negative is kept, not cleared: a run of attempts that did not take is what makes a Repeat
 * Breeder.
 */
export const pregnancyCheck = pgTable(
  "pregnancy_check",
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
    /** The first service of the attempt checked. */
    serviceId: text("service_id")
      .notNull()
      .references(() => service.id),
    result: text("result", { enum: PREGNANCY_CHECK_RESULTS }).notNull(),
    checkedAt: timestamp("checked_at").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pregnancy_check_completion_uidx").on(table.completionId),
    index("pregnancy_check_animal_idx").on(table.animalId, table.checkedAt),
  ]
);

/**
 * She calved: when, how it went, and the service it came from.
 *
 * The calves are animals of their own, each pointing back at this row, so twins are one Calving with
 * two calves and a stillborn calf is on the record like any other. The Lactation it began is kept on
 * it, because her Lactation number moves on with the next calving and this one's must still read back.
 * Keyed on the Step Completion that recorded it, so a replay or a Correction replaces rather than adds.
 */
export const calving = pgTable(
  "calving",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    damId: text("dam_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    completionId: text("completion_id")
      .notNull()
      .references(() => stepCompletion.id, { onDelete: "cascade" }),
    calvedAt: timestamp("calved_at").notNull(),
    ease: text("ease", { enum: CALVING_EASES }).notNull(),
    /** The first service of the attempt she calved from, when this farm served her. */
    serviceId: text("service_id").references(() => service.id),
    lactationNumber: integer("lactation_number").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("calving_completion_uidx").on(table.completionId),
    index("calving_dam_idx").on(table.damId, table.calvedAt),
  ]
);

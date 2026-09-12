import {
  index,
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("service_completion_uidx").on(table.completionId),
    index("service_animal_idx").on(table.animalId, table.servedAt),
  ]
);

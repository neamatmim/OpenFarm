import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";
import { animal, pen } from "./herd";
import { stepCompletion } from "./instance";

/**
 * An Animal the farm cannot find: the round looked for her in her Pen and she was not there. The farm's **Missing** —
 * opened by the round's "Animal not found", closed by the Manager's Found. She stays in the herd, on her Pen's board and
 * on the round, while it is open: nobody has said she is gone, only that she was not where the farm thought.
 *
 * One open at a time for an animal, so a second morning that cannot find her either is the same Missing, told once.
 */
export const missing = pgTable(
  "missing",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    /** The Pen the round looked for her in, as it stood that morning. */
    penId: text("pen_id")
      .notNull()
      .references(() => pen.id),
    /** The round's Step that could not find her. A Correction of it that finds her after all takes the Missing back. */
    completionId: text("completion_id").references(() => stepCompletion.id, {
      onDelete: "cascade",
    }),
    /** When the round says it looked: the phone's clock, as every Step's is. */
    since: timestamp("since").notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
    /** The Manager's Found: when, and who. Nothing is deleted once she is found — that she went missing stays true. */
    foundAt: timestamp("found_at"),
    foundBy: text("found_by").references(() => user.id),
  },
  (table) => [
    index("missing_farm_idx").on(table.farmId, table.since),
    /** One Missing open for an animal at a time. */
    uniqueIndex("missing_open_uidx")
      .on(table.animalId)
      .where(sql`${table.foundAt} is null`),
    index("missing_completion_idx").on(table.completionId),
  ]
);

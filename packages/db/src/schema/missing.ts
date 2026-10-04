import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { farm } from "./farm";
import { ANIMAL_STATES, animal, pen } from "./herd";
import { stepCompletion } from "./instance";

/**
 * An Animal the farm cannot find: the round looked for her in her Pen and she was not there. The farm's **Missing** —
 * opened by the round's "Animal not found", closed by the Manager's Found. She stays in the herd, on her Pen's board and
 * on the round, while it is open: nobody has said she is gone, only that she was not where the farm thought.
 *
 * One open at a time for an animal, so a second morning that cannot find her either is the same Missing, told once.
 *
 * The Owner's write-off closes it the other way: she leaves the herd as **Lost**, and the Missing keeps why — stolen or
 * strayed, in the Owner's words, with the thana's GD number for a theft — and the State she was in, so that one found
 * after all can come back as she was.
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
      .references(() => animal.id),
    /** The Pen the round looked for her in, as it stood that morning. */
    penId: text("pen_id")
      .notNull()
      .references(() => pen.id),
    /** The round's Step that could not find her. A Correction of it that finds her after all takes the Missing back. */
    completionId: text("completion_id").references(() => stepCompletion.id),
    /** When the round says it looked: the phone's clock, as every Step's is. */
    since: timestamp("since", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    /** The Manager's Found: when, and who. Nothing is deleted once she is found — that she went missing stays true. */
    foundAt: timestamp("found_at", { withTimezone: true }),
    foundBy: text("found_by").references(() => user.id),
    /** The Owner's write-off: when, and who. She left the herd as Lost from `since`, when she was last looked for. */
    writtenOffAt: timestamp("written_off_at", { withTimezone: true }),
    writtenOffBy: text("written_off_by").references(() => user.id),
    /** What the farm believes became of her, in the Owner's words, as a Mortality's cause is. */
    lostCause: text("lost_cause"),
    /** Stolen, which asks for the thana's GD number, rather than strayed or not known. */
    stolen: boolean("stolen").notNull().default(false),
    gdNumber: text("gd_number"),
    /** The State she was in when she was written off, and since when: what she comes back as if she is found. */
    stateBefore: text("state_before", { enum: ANIMAL_STATES }),
    stateChangedBefore: timestamp("state_changed_before", {
      withTimezone: true,
    }),
  },
  (table) => [
    index("missing_farm_idx").on(table.farmId, table.since),
    /** One Missing open for an animal at a time: neither found nor written off. */
    uniqueIndex("missing_open_uidx")
      .on(table.animalId)
      .where(sql`${table.foundAt} is null and ${table.writtenOffAt} is null`),
    index("missing_completion_idx").on(table.completionId),
  ]
);

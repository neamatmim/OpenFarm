import type { EntryOutcome } from "@OpenFarm/db/schema/sync";
import { z } from "zod";

import { workInput } from "./entries/claim";
import type { EntryRefusal } from "./entries/entry";
import { moveInput } from "./entries/move";
import { observationInput } from "./entries/observation";
import { stepCompletionInput } from "./entries/step-completion";
import { stepPhotoInput } from "./entries/step-photo";

/** Every entry carries what the phone knew: its own id for the record, where in its own
 *  sequence the entry sits, and when it says the work happened. The server stamps when it
 *  took it, and the phone can never set that (ADR 0002). */
const entryBase = {
  id: z.string().min(1).max(64),
  seq: z.number().int().min(0),
  recordedAt: z.coerce.date(),
  /** Who recorded it. A Shed Phone names the person PIN-switched in at the moment of recording, so work entered
   *  offline stays theirs when somebody else is switched in by the time the phone finds signal. */
  actorId: z.string().min(1).max(64).optional(),
  /** The proof that the person named entered their PIN on this phone for this work: the switch token the farm gave
   *  them for it. Needed whenever the entry names somebody other than whoever is sending. */
  switchToken: z.string().min(1).max(200).optional(),
};

export const entryInput = z.discriminatedUnion("kind", [
  z.object({
    ...entryBase,
    kind: z.literal("instance_claim"),
    ...workInput.shape,
  }),
  z.object({
    ...entryBase,
    kind: z.literal("instance_complete"),
    ...workInput.shape,
  }),
  z.object({
    ...entryBase,
    kind: z.literal("step_completion"),
    ...stepCompletionInput.shape,
  }),
  z.object({
    ...entryBase,
    kind: z.literal("completion_photo"),
    ...stepPhotoInput.shape,
  }),
  z.object({
    ...entryBase,
    kind: z.literal("animal_move"),
    ...moveInput.shape,
  }),
  z.object({
    ...entryBase,
    kind: z.literal("observation"),
    ...observationInput.shape,
  }),
]);

export type Entry = z.infer<typeof entryInput>;

/** An entry as a phone sends it, before the farm has read it. */
export type EntryInput = z.input<typeof entryInput>;

export interface EntryResult {
  id: string;
  seq: number;
  outcome: EntryOutcome;
  /** Why it was held or refused, for whoever reads a log. */
  reason?: string;
  /** Why, as the phone puts it into the reader's words. */
  refusal?: EntryRefusal;
}

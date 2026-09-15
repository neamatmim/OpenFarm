import { observation } from "@OpenFarm/db/schema/observation";
import {
  OBSERVATION_WORD_NEEDING_A_NOTE,
  observationWordOf,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { requireAnimalInScope } from "../scope";
import type { EntryKind } from "./entry";
import { requireAnimalStillHere } from "./entry";

/** What somebody reports seeing, with no round asking: which animal, what, and in their own words if they add any. */
export const observationInput = z.object({
  tagNumber: z.string().trim().min(1).max(32),
  saw: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional(),
});

export type ObservationInput = z.infer<typeof observationInput>;

/**
 * An Observation nobody's round asked for. Anybody who handles the animals may make one — Barn Staff on the animals in
 * their own Pens, a visiting Vet on the animals on their cases — and what is seen goes to the Vet's inbox and, for a
 * heat, begins the breeding work, exactly as an Observation on the round does.
 */
export const observationEntry: EntryKind<
  ObservationInput,
  { id: string; animalId: string }
> = {
  roles: ["owner", "manager", "staff", "vet"],
  visitingVet: true,

  trail: () => ({
    entity: "observation",
    action: "create",
    entityId: ({ id }) => id,
    // What the farm now holds of it — the word as the farm keeps it, whose it is and when it was seen — rather than what
    // the phone typed.
    after: async (tx, { id }) =>
      (await tx.query.observation.findFirst({
        where: { id },
        columns: {
          animalId: true,
          saw: true,
          sawLabel: true,
          note: true,
          seenBy: true,
          seenAt: true,
        },
      })) ?? null,
  }),

  apply: async (tx, context, input, { id, doneAt, receivedAt }) => {
    const seen = observationWordOf(input.saw);
    if (!seen) {
      throw new ORPCError("BAD_REQUEST", {
        message: `"${input.saw}" is not something the farm records seeing`,
      });
    }
    const note = input.note?.trim() || null;
    if (seen.value === OBSERVATION_WORD_NEEDING_A_NOTE && !note) {
      throw new ORPCError("BAD_REQUEST", { message: "Say what was seen" });
    }
    const beast = await requireAnimalStillHere(
      tx,
      context.farm.id,
      input.tagNumber
    );
    // What they see of an animal is theirs to write down when she is in their Pens or on their Cases.
    requireAnimalInScope(context.scope, beast);
    await tx.insert(observation).values({
      id,
      farmId: context.farm.id,
      animalId: beast.id,
      completionId: null,
      saw: seen.value,
      sawLabel: seen.bn,
      note,
      seenBy: context.actor.id,
      // When it was seen is when it was written down; when the farm heard of it is kept beside.
      seenAt: doneAt,
      recordedAt: receivedAt,
    });
    return { id, animalId: beast.id };
  },
};

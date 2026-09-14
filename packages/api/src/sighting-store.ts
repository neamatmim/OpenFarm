import { uuidv7 } from "@OpenFarm/db/ids";
import { observation } from "@OpenFarm/db/schema/observation";
import { SIGHTING_NEEDING_A_NOTE, sightingOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import type { Recorder } from "./completion-store";
import { assertPenIsTheirs, loadLiveAnimal } from "./herd-store";
import { assertOnTheirCases } from "./visiting-store";

/** What somebody reports seeing, with no round asking: which animal, what, and in their own words if they add any. */
export const sightingInput = z.object({
  tagNumber: z.string().trim().min(1).max(32),
  saw: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional(),
});

/**
 * Writes an Observation nobody's round asked for. Barn Staff report on the animals in their own Pens, as they record
 * everything else; what is seen goes to the Vet's inbox and — for a heat — begins the breeding work, exactly as a
 * sighting on the round does.
 */
export const recordSighting = async (
  tx: Tx,
  context: Recorder,
  input: z.infer<typeof sightingInput>,
  { seenAt, now, id = uuidv7(now) }: { seenAt: Date; now: Date; id?: string }
): Promise<{ id: string; animalId: string }> => {
  const sighting = sightingOf(input.saw);
  if (!sighting) {
    throw new ORPCError("BAD_REQUEST", {
      message: `"${input.saw}" is not something the farm records seeing`,
    });
  }
  const note = input.note?.trim() || null;
  if (sighting.value === SIGHTING_NEEDING_A_NOTE && !note) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Say what was seen",
    });
  }
  const beast = await loadLiveAnimal(
    tx,
    context.farm.id,
    input.tagNumber.toUpperCase()
  );
  assertPenIsTheirs(context, beast.penId);
  assertOnTheirCases(context, beast.id);
  await tx.insert(observation).values({
    id,
    farmId: context.farm.id,
    animalId: beast.id,
    completionId: null,
    saw: sighting.value,
    sawLabel: sighting.bn,
    note,
    seenBy: context.actor.id,
    seenAt,
    recordedAt: now,
  });
  return { id, animalId: beast.id };
};

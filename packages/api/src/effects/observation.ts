import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { observation } from "@OpenFarm/db/schema/observation";
import { HEAT } from "@OpenFarm/domain";

import type { Trail, Tx } from "../audit";
import { callOffWorkRaisedBy } from "../herd-store";
import { heatKeyOf } from "../work-cause";
import type { EffectInput, EffectKind, EffectResult } from "./effect";
import { asPublished, choiceIn } from "./evidence";

type ObservationFacts = Pick<
  EffectInput,
  | "step"
  | "instance"
  | "animalId"
  | "evidence"
  | "skipped"
  | "completionId"
  | "recordedBy"
  | "recordedAt"
  | "now"
  | "trail"
>;

/**
 * A Heat the farm no longer believes in takes its AI work back with it.
 *
 * Withdrawing the Observation stops new work being raised on it — `recentHappenings` reads only
 * sightings that stand — but not work already raised, which would still send somebody to serve a
 * cow who was not in heat. If this sighting had begun her heat, its job closes; a later sighting
 * of the same heat that still stands will begin it instead, and raise afresh on the next pass.
 */
const unraiseIfHeat = async (
  tx: Tx,
  farmId: string,
  withdrawn: { id: string; saw: string },
  trail: Trail
) => {
  if (withdrawn.saw === HEAT) {
    await callOffWorkRaisedBy(tx, farmId, heatKeyOf(withdrawn.id), trail);
  }
};

/**
 * Records what somebody saw of one animal on the round — the farm's Observation, which starts
 * the health chain and which Breeding reads as a Heat when that is what was seen.
 *
 * Unlike the litres and the Moves, a Correction here never rewrites the row and never removes
 * it. It withdraws it and writes the new one beside it, pointing back: what somebody said they
 * saw is a fact about the round, and it stays true that they said it even after the farm
 * decides they were looking at the wrong cow.
 */
const recordWhatWasSeen = async (
  tx: Tx,
  input: ObservationFacts
): Promise<EffectResult> => {
  const standing = await tx.query.observation.findFirst({
    where: { completionId: input.completionId, withdrawnAt: { isNull: true } },
    columns: { id: true, saw: true },
  });

  if (input.skipped) {
    if (standing) {
      await tx
        .update(observation)
        .set({ withdrawnAt: input.now })
        .where(eq(observation.id, standing.id));
      await unraiseIfHeat(tx, input.instance.farmId, standing, input.trail);
    }
    return null;
  }

  const chosen = choiceIn(
    input.step,
    input.evidence,
    "This step records what was seen, and nothing was chosen"
  );
  if (standing && standing.saw === chosen.value) {
    // The same entry again — a phone repeating itself, or a Correction that changed
    // something else about the Step. Nothing was seen twice.
    return { kind: "observation", saw: chosen.value, supersedes: false };
  }
  const id = uuidv7(input.now);
  if (standing) {
    await tx
      .update(observation)
      .set({ withdrawnAt: input.now, supersededById: id })
      .where(eq(observation.id, standing.id));
    await unraiseIfHeat(tx, input.instance.farmId, standing, input.trail);
  }
  await tx.insert(observation).values({
    id,
    farmId: input.instance.farmId,
    // Looked at one at a time (the published Version says so), so the Step names her.
    animalId: asPublished(input.animalId, "the animal that was looked at"),
    completionId: input.completionId,
    saw: chosen.value,
    sawLabel: chosen.label.bn,
    seenBy: input.recordedBy,
    seenAt: input.recordedAt,
    recordedAt: input.now,
  });
  return {
    kind: "observation",
    saw: chosen.value,
    supersedes: Boolean(standing),
  };
};

/** A Step that records what was seen of an animal on the round. */
export const observationEffect: EffectKind<ObservationFacts> = {
  kind: "observation",
  apply: recordWhatWasSeen,
};

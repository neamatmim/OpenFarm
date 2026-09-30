import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { observation } from "@OpenFarm/db/schema/observation";
import { HEAT } from "@OpenFarm/domain";

import type { Trail, Tx } from "../audit";
import { callOffWorkRaisedBy } from "../herd-store";
import { openMissing, takeBackMissingOpenedBy } from "../missing-store";
import { heatKeyOf, unwellKeyOf } from "../work-cause";
import type { EffectInput, EffectKind, EffectResult } from "./effect";
import { asPublished, choiceIn } from "./evidence";

type ObservationFacts = Pick<
  EffectInput,
  | "step"
  | "instance"
  | "animalId"
  | "evidence"
  | "skipped"
  | "skippedAs"
  | "completionId"
  | "recordedBy"
  | "recordedAt"
  | "now"
  | "trail"
>;

/**
 * An Observation the farm no longer believes in takes the work it raised back with it.
 *
 * Withdrawing it stops new work being raised on it — `recentHappenings` reads only sightings that
 * stand — but not work already raised, which would still send somebody to serve a cow who was not in
 * heat, or to see to one who was never unwell. If this sighting had begun her heat, its job closes; a
 * later sighting of the same heat that still stands will begin it instead, and raise afresh on the
 * next pass. Anything else it saw closes the Manager's work on it.
 */
const unraiseWhatItRaised = async (
  tx: Tx,
  farmId: string,
  withdrawn: { id: string; saw: string },
  trail: Trail
) => {
  await (withdrawn.saw === HEAT
    ? callOffWorkRaisedBy(tx, farmId, heatKeyOf(withdrawn.id), trail)
    : callOffWorkRaisedBy(
        tx,
        farmId,
        unwellKeyOf(withdrawn.id),
        trail,
        "observation_withdrawn"
      ));
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

  // Not found opens a Missing; anything else this Step now says — she was seen, or passed as well — means the round
  // found her after all, and a Missing it opened is taken back.
  await (input.skippedAs === "not_found"
    ? openMissing(tx, {
        farmId: input.instance.farmId,
        animalId: asPublished(input.animalId, "the animal that was looked for"),
        completionId: input.completionId,
        since: input.recordedAt,
        now: input.now,
      })
    : takeBackMissingOpenedBy(tx, input.completionId));

  if (input.skipped) {
    if (standing) {
      await tx
        .update(observation)
        .set({ withdrawnAt: input.now })
        .where(eq(observation.id, standing.id));
      await unraiseWhatItRaised(
        tx,
        input.instance.farmId,
        standing,
        input.trail
      );
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
    await unraiseWhatItRaised(tx, input.instance.farmId, standing, input.trail);
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

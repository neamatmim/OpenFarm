import { ORPCError } from "@orpc/server";

import type { Tx } from "../audit";
import { loadLiveAnimal, requirePen, walkByStep } from "../herd-store";
import type { EffectInput, EffectResult, EffectKind } from "./effect";
import { asPublished, choiceIn } from "./evidence";

type MoveFacts = Pick<
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
  | "pregnancyTimes"
  | "trail"
>;

/**
 * Walks her to the Pen the Step recorded, and writes the Move that says the Playbook did it.
 *
 * Keyed on the Completion, like every other effect: a Manager correcting the entry changes where
 * she went rather than sending her on a second journey. What it will not do is rewrite where she
 * is when anything has moved her since the Step was done — that is a fact the farm has and the
 * Step does not — so she stays where she was last seen and the Effect stands aside: a Step
 * arriving so is a late Entry, and a Correction so is put in front of the Manager.
 *
 * The Pen she is walked to is not checked against the doer's Pen Assignments, unlike a Move
 * somebody records by hand. The destinations are the Owner's, authored into the Step, and a
 * milker assigned to the milking pen has to be able to walk a cow to the dry pen — that is
 * what the procedure says to do. What they may work on is already settled by the Instance.
 */
const walkAsTheStepSays = async (
  tx: Tx,
  input: MoveFacts
): Promise<EffectResult> => {
  // Moved one at a time (the published Version says so), so the Step names her.
  const animalId = asPublished(input.animalId, "the animal it moves");
  const beast = await tx.query.animal.findFirst({
    where: { id: animalId, farmId: input.instance.farmId },
    columns: {
      id: true,
      tagNumber: true,
      penId: true,
      side: true,
      state: true,
    },
  });
  if (!beast) {
    throw new ORPCError("NOT_FOUND", { message: "No such animal" });
  }
  // An animal that has left the farm cannot be walked anywhere, whoever is asking.
  const live = await loadLiveAnimal(tx, input.instance.farmId, beast.tagNumber);
  const toPenId = input.skipped
    ? null
    : choiceIn(
        input.step,
        input.evidence,
        "This step moves an animal, and no pen was chosen"
      ).value;
  if (toPenId) {
    // A Pen that is not this farm's is not somewhere she can be walked to.
    await requirePen(tx, input.instance.farmId, toPenId);
  }
  const walked = await walkByStep(tx, {
    farmId: input.instance.farmId,
    beast: live,
    completionId: input.completionId,
    toPenId,
    movedBy: input.recordedBy,
    movedAt: input.recordedAt,
    now: input.now,
    calvingLeadDays: input.pregnancyTimes.calvingLeadDays,
    trail: input.trail,
  });
  if (!walked) {
    return null;
  }
  const { movedSince, ...where } = walked;
  return {
    kind: "move",
    ...where,
    // She has been walked on since: the Move says what the Step says, and she stays where the farm last saw her.
    standsAside: movedSince
      ? { because: "moved_since", params: { toPenId: where.toPenId } }
      : null,
  };
};

/** A Step that walks an animal to a Pen. */
export const moveEffect: EffectKind<MoveFacts> = {
  kind: "move",
  apply: walkAsTheStepSays,
};

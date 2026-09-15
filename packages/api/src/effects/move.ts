import { ORPCError } from "@orpc/server";

import type { Tx } from "../audit";
import type { EffectInput, EffectResult } from "../effects";
import { loadLiveAnimal, requirePen, walkByStep } from "../herd-store";
import type { EffectKind } from "./effect";
import { choiceIn } from "./evidence";

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
 * Keyed on the Completion, like every other effect: a phone replaying an entry, or a Manager
 * correcting one, changes where she went rather than sending her on a second journey. What
 * it will not do is rewrite where she is when anything has moved her since the entry was
 * recorded — that is a fact the farm has and this Correction does not, so she stays where she
 * was last seen and a person is asked (Needs Review, irreversible effect).
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
  if (!input.animalId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step moves an animal, and it was not recorded against one",
    });
  }
  const beast = await tx.query.animal.findFirst({
    where: { id: input.animalId, farmId: input.instance.farmId },
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

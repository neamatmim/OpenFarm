import { CALVING_RECORDERS, CALVING_STEP } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "../audit";
import { recordCalving } from "../calving-store";
import type { EffectInput, EffectResult, EffectKind } from "./effect";
import { asPublished, heldIn, turnsIn } from "./evidence";

type CalvingFacts = Pick<
  EffectInput,
  | "step"
  | "instance"
  | "animalId"
  | "evidence"
  | "skipped"
  | "completionId"
  | "roleUsed"
  | "recordedBy"
  | "now"
  | "pregnancyTimes"
  | "trail"
>;

/** The calving a Step's Evidence describes, read by the names its shape gives them. */
const calvingIn = (input: CalvingFacts) => {
  const at = heldIn(input, CALVING_STEP, "calvedAt");
  if (!at) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A calving says when she calved",
    });
  }
  if (at.getTime() > input.now.getTime()) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A calving cannot have happened later than now",
      data: { refusal: "calved_in_the_future" },
    });
  }
  const ease = asPublished(
    heldIn(input, CALVING_STEP, "ease"),
    "how the calving went"
  );
  const calves = [];
  for (const calf of turnsIn(input, CALVING_STEP, "calves")) {
    const { sex, outcome } = calf;
    // A calf is its sex and whether it lived, both or neither: half a calf is not one to create.
    if (Boolean(sex) !== Boolean(outcome)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Each calf needs its sex and whether it was born alive",
      });
    }
    if (sex && outcome) {
      calves.push({ sex, outcome });
    }
  }
  if (calves.length === 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A calving has a calf; one without is an abortion",
    });
  }
  return { at, ease, calves };
};

/**
 * Records that she calved — Barn Staff's to record on the round, or the Manager's.
 *
 * The roles matrix gives Calving `C R U` to the Manager and `C` to Barn Staff as an SOP step, and only
 * read to the Owner; the Owner may step into any shift, so the kind says who may record it.
 */
const recordHerCalving = async (
  tx: Tx,
  input: CalvingFacts
): Promise<EffectResult> => {
  const damId = input.animalId ?? input.instance.animalId;
  if (!damId) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A calving is recorded about one cow, and this entry is about none",
    });
  }
  const recorded = await recordCalving(tx, {
    farmId: input.instance.farmId,
    damId,
    completionId: input.completionId,
    calved: input.skipped ? null : calvingIn(input),
    recordedBy: input.recordedBy,
    recordedByRole: input.roleUsed,
    times: input.pregnancyTimes,
    now: input.now,
    trail: input.trail,
  });
  if (!recorded) {
    return null;
  }
  const { actedOn, ...calved } = recorded;
  return {
    kind: "calving",
    ...calved,
    // Corrected in a way the farm has already acted on — a calf added or taken away, one who has since left found
    // stillborn: nothing changed, and a person is asked.
    standsAside: actedOn ? { because: "calving_acted_on" } : null,
  };
};

/** A Step that records a calving. */
export const calvingEffect: EffectKind<CalvingFacts> = {
  kind: "calving",
  recordableBy: {
    roles: CALVING_RECORDERS,
    refusal: {
      message: "A calving is recorded by Barn Staff, the Manager or the Owner",
      reason: "staff_or_manager_only",
    },
  },
  apply: recordHerCalving,
};

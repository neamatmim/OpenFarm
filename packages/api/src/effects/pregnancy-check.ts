import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { pregnancyCheck } from "@OpenFarm/db/schema/breeding";
import { PREGNANCY_CHECK_RESULTS } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "../audit";
import { attemptThatRaisedWork } from "../breeding-store";
import { rederiveFor } from "./breeding";
import type { EffectInput, EffectResult, EffectKind } from "./effect";
import { asPublished, choiceAt } from "./evidence";

type PregnancyCheckFacts = Pick<
  EffectInput,
  | "step"
  | "instance"
  | "evidence"
  | "completionId"
  | "recordedBy"
  | "recordedAt"
  | "now"
  | "pregnancyTimes"
  | "trail"
>;

/**
 * Records what the Vet found: whether the attempt a Service began has taken.
 *
 * The Vet's alone to record, and to put right (roles matrix: Pregnancy Check `C R U` to the Vet, read to the Owner and
 * the Manager): whether a cow is carrying is a clinical finding.
 *
 * Of an attempt, not of a service, and only on the work that attempt raised: which of her heats a
 * pregnancy dates from is the farm's to know, not the Vet's to guess. A positive makes a Heifer a
 * Pregnant Heifer and sets Expected Calving from the attempt's first service; a negative is kept — a
 * run of them is a Repeat Breeder — and takes nothing from her. Both are worked out from the checks,
 * never typed.
 */
const recordTheCheck = async (
  tx: Tx,
  input: PregnancyCheckFacts
): Promise<EffectResult> => {
  const cowId = input.instance.animalId;
  const standing = await tx.query.pregnancyCheck.findFirst({
    where: { completionId: input.completionId },
    columns: { id: true, serviceId: true, result: true },
  });
  const wasPositive = standing?.result === "positive";
  // What was found is the Step's first answer, and a required one (the published Version says so).
  const result = asPublished(
    choiceAt(input.step, input.evidence, 0, PREGNANCY_CHECK_RESULTS),
    "what the check found"
  );
  // A correction keeps the attempt the check was made of, even if she has been served since.
  const raisedBy =
    standing || !cowId
      ? null
      : await attemptThatRaisedWork(tx, cowId, input.instance.cause);
  const serviceId = standing?.serviceId ?? raisedBy?.id;
  if (!(cowId && serviceId)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A pregnancy check is of the service that raised it, and this work was not raised by her latest",
      data: { refusal: "check_without_a_service" },
    });
  }

  const values = {
    farmId: input.instance.farmId,
    animalId: cowId,
    completionId: input.completionId,
    serviceId,
    result,
    checkedAt: input.recordedAt,
    recordedBy: input.recordedBy,
  };
  await (standing
    ? tx
        .update(pregnancyCheck)
        .set(values)
        .where(eq(pregnancyCheck.id, standing.id))
    : tx
        .insert(pregnancyCheck)
        .values({ id: uuidv7(input.now), ...values, createdAt: input.now }));
  return {
    kind: "pregnancy_check",
    result,
    ...(await rederiveFor(
      tx,
      input,
      cowId,
      wasPositive && result === "negative"
    )),
  };
};

/** A Step that records a Pregnancy Check. */
export const pregnancyCheckEffect: EffectKind<PregnancyCheckFacts> = {
  kind: "pregnancy_check",
  recordableBy: {
    roles: ["vet"],
    refusal: {
      message: "A pregnancy check is the Vet's to record",
      reason: "vet_only",
    },
  },
  apply: recordTheCheck,
};

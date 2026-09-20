import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { service } from "@OpenFarm/db/schema/breeding";
import { SERVICE_STEP } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "../audit";
import { callOffWorkOfAttemptsNoLongerStanding } from "../breeding-store";
import { nothingFollowed } from "../calving-work";
import { heatThatRaised, isOnTheFarm } from "../instances-store";
import { rederiveFor } from "./breeding";
import type { EffectInput, EffectResult, EffectKind } from "./effect";
import { asPublished, heldIn } from "./evidence";

type ServiceFacts = Pick<
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
  | "roleUsed"
  | "trail"
>;

/**
 * What a service changed further down the chain. A day corrected, a first service taken back, or a
 * new heat served moves her latest attempt: work raised by one that no longer stands is closed, and
 * a check already made counts from the day as it now stands.
 */
const breedingFollowsService = async (
  tx: Tx,
  input: ServiceFacts,
  cowId: string
) => {
  await callOffWorkOfAttemptsNoLongerStanding(
    tx,
    input.instance.farmId,
    cowId,
    input.trail
  );
  return rederiveFor(tx, input, cowId, false);
};

/**
 * Records that she was served: how, by which sire, by whom, and in answer to which Heat.
 *
 * The Manager's alone to record (roles matrix: Service `C R U` to the Manager, nothing to Barn Staff or the Vet): the
 * Vet's breeding acts are the Pregnancy Check and the Abortion; a milker's is recording a Calving on the round.
 *
 * A natural service names a bull standing on this farm. A tag that is not one is a sire nobody can
 * trace, and parentage is the whole reason the record exists.
 */
const recordTheService = async (
  tx: Tx,
  input: ServiceFacts
): Promise<EffectResult> => {
  const cowId = input.animalId ?? input.instance.animalId;
  if (!cowId) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A service is recorded about one cow, and this work is about none",
    });
  }
  // A service is of a cow. Recorded against a bull or a steer, it is a service of nothing, and the
  // Pregnancy Check and Calving that count from it would be counting from a mistake.
  const cow = await tx.query.animal.findFirst({
    where: { id: cowId },
    columns: { sex: true },
  });
  if (cow?.sex !== "female") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only a cow is served",
      data: { refusal: "service_of_a_male" },
    });
  }
  const standing = await tx.query.service.findFirst({
    where: { completionId: input.completionId },
    columns: { id: true },
  });
  if (input.skipped) {
    if (standing) {
      // A service the Vet has checked is the attempt that check is of. Taking it back would leave a
      // finding about nothing; the check is corrected first, by the Vet whose finding it is.
      const checked = await tx.query.pregnancyCheck.findFirst({
        where: { serviceId: standing.id },
        columns: { id: true },
      });
      if (checked) {
        return {
          kind: "service",
          method: null,
          standsAside: { because: "service_checked" },
          ...nothingFollowed(),
        };
      }
      await tx.delete(service).where(eq(service.id, standing.id));
      return {
        kind: "service",
        method: null,
        standsAside: null,
        ...(await breedingFollowsService(tx, input, cowId)),
      };
    }
    return null;
  }

  const method = heldIn(input, SERVICE_STEP, "method");
  if (!method) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A service says how she was served, and nothing was chosen",
    });
  }
  const sire = asPublished(heldIn(input, SERVICE_STEP, "sire"), "the sire");

  // The story asks for the technician. A bull running with the herd has nobody standing over him,
  // so it is only an AI service that is refused without a name.
  const servedBy = heldIn(input, SERVICE_STEP, "servedBy");
  if (method === "ai" && !servedBy) {
    throw new ORPCError("BAD_REQUEST", {
      message: "An AI service names who served her",
      data: { refusal: "service_needs_technician" },
    });
  }

  // When she was served, which is not when it was written down. A day that has not come yet is not
  // a service; one that cannot be read is not a day.
  const servedAt = heldIn(input, SERVICE_STEP, "servedAt");
  if (!servedAt) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A service says when she was served",
    });
  }
  if (servedAt.getTime() > input.now.getTime()) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A service cannot have happened later than now",
      data: { refusal: "served_in_the_future" },
    });
  }

  let sireAnimalId: string | null = null;
  if (method === "natural") {
    const bull = await tx.query.animal.findFirst({
      where: {
        farmId: input.instance.farmId,
        tagNumber: sire.toUpperCase(),
        sex: "male",
      },
      columns: { id: true, state: true },
    });
    if (!(bull && isOnTheFarm(bull))) {
      throw new ORPCError("BAD_REQUEST", {
        message: `There is no bull with tag ${sire} on this farm`,
        data: { refusal: "no_such_bull" },
      });
    }
    sireAnimalId = bull.id;
  }

  const values = {
    farmId: input.instance.farmId,
    animalId: cowId,
    completionId: input.completionId,
    method,
    sireStraw: method === "ai" ? sire : null,
    sireAnimalId,
    servedBy,
    heatId: heatThatRaised(input.instance.cause),
    // The Role the Service was recorded under, on the record itself: the Owner's when the Step ran under
    // it, since the Owner may now record one; the Manager's otherwise.
    recordedByRole:
      input.roleUsed === "owner" ? ("owner" as const) : ("manager" as const),
    servedAt,
    recordedBy: input.recordedBy,
  };
  await (standing
    ? tx.update(service).set(values).where(eq(service.id, standing.id))
    : tx
        .insert(service)
        .values({ id: uuidv7(input.now), ...values, createdAt: input.now }));
  return {
    kind: "service",
    method,
    standsAside: null,
    ...(await breedingFollowsService(tx, input, cowId)),
  };
};

/** A Step that records a Service. */
export const serviceEffect: EffectKind<ServiceFacts> = {
  kind: "service",
  recordableBy: {
    roles: ["owner", "manager"],
    refusal: {
      message: "A service is the Manager's or the Owner's to record",
      reason: "manager_only",
    },
  },
  apply: recordTheService,
};

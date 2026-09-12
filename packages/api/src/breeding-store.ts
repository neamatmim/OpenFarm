import { eq, inArray } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import {
  OPEN_INSTANCE_STATES,
  attemptsThatBegin,
  expectedCalvingFrom,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { ATTEMPT_KEY_PREFIX, attemptKeyOf } from "./instances-store";

interface Served {
  id: string;
  animalId: string;
  servedAt: Date;
}

/** Every service she has had, oldest first — the ones that did not take included. */
const servicesOf = (tx: Tx, animalId: string): Promise<Served[]> =>
  tx.query.service.findMany({
    where: { animalId },
    columns: { id: true, animalId: true, servedAt: true },
    orderBy: { servedAt: "asc", id: "asc" },
  });

/**
 * The attempt a service belongs to: the first service of the heat it was given in. A service is
 * the start of its own attempt, or the second of the latest attempt begun before it.
 */
export const attemptOf = (
  services: Served[],
  serviceId: string
): Served | null => {
  const one = services.find((each) => each.id === serviceId);
  if (!one) {
    return null;
  }
  return (
    attemptsThatBegin(services).findLast(
      (attempt) => attempt.servedAt <= one.servedAt
    ) ?? null
  );
};

/**
 * Which attempt a Pregnancy Check is of. The attempt that raised the work, while it still stands as
 * one; otherwise — a Vet walking a Pen of served cows — her latest attempt. Null when she has not
 * been served, which is a check of nothing.
 */
export const attemptToCheck = async (
  tx: Tx,
  animalId: string,
  raisedBy: string | null
): Promise<Served | null> => {
  // No service lies in the future: the Service refuses one.
  const attempts = attemptsThatBegin(await servicesOf(tx, animalId));
  return (
    attempts.find((attempt) => attempt.id === raisedBy) ??
    attempts.at(-1) ??
    null
  );
};

/**
 * Closes the Pregnancy Checks no attempt calls for any more.
 *
 * An attempt's check is raised under its first service and the day she was served. A Correction
 * that moves that day, or takes the first service back so that the second now begins the attempt,
 * leaves work raised on a day or a service that no longer stands — which would send the Vet on the
 * wrong day. Only open work: a check already done was done. The attempt as it now stands raises its
 * own on the next pass.
 */
export const closeChecksNoLongerCalledFor = async (
  tx: Tx,
  farmId: string,
  animalId: string
): Promise<void> => {
  const services = await servicesOf(tx, animalId);
  const standing = new Set(attemptsThatBegin(services).map(attemptKeyOf));
  const open = await tx.query.sopInstance.findMany({
    where: {
      farmId,
      animalId,
      cause: { like: `${ATTEMPT_KEY_PREFIX}%` },
      state: { in: [...OPEN_INSTANCE_STATES] },
    },
    columns: { id: true, cause: true },
  });
  const orphaned = open.filter(
    (work) =>
      ![...standing].some((key) => work.cause?.startsWith(`${key}:`) ?? false)
  );
  if (orphaned.length > 0) {
    await tx
      .update(sopInstance)
      .set({ state: "missed" })
      .where(
        inArray(
          sopInstance.id,
          orphaned.map((work) => work.id)
        )
      );
  }
};

/**
 * Works out, again, what her Pregnancy Checks say about her: when she is expected to calve, and
 * whether a heifer is carrying.
 *
 * Decided by her latest check, and never typed. Positive: Expected Calving is that attempt's first
 * service carried the farm's gestation on, and a Heifer is a Pregnant Heifer. Negative: nothing is
 * expected, and a Pregnant Heifer whose latest check says otherwise is a Heifer — which is how a
 * mistaken positive, corrected, is put back. A cow with no check at all is left as she is: a heifer
 * bought in carrying has her due date from her intake, not from a check this farm never made.
 */
export const rederivePregnancy = async (
  tx: Tx,
  animalId: string,
  { gestationDays, at, now }: { gestationDays: number; at: Date; now: Date }
): Promise<void> => {
  const [latest] = await tx.query.pregnancyCheck.findMany({
    where: { animalId },
    columns: { result: true, serviceId: true },
    orderBy: { checkedAt: "desc", id: "desc" },
    limit: 1,
  });
  if (!latest) {
    return;
  }
  const her = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: { state: true },
  });
  const attempt =
    latest.result === "positive"
      ? attemptOf(await servicesOf(tx, animalId), latest.serviceId)
      : null;
  const expectedCalvingAt = attempt
    ? expectedCalvingFrom(attempt.servedAt, gestationDays)
    : null;
  let state = her?.state;
  if (attempt && state === "heifer") {
    state = "pregnant_heifer";
  } else if (!attempt && state === "pregnant_heifer") {
    state = "heifer";
  }
  await tx
    .update(animal)
    .set({
      expectedCalvingAt,
      ...(state && state !== her?.state ? { state, stateChangedAt: at } : {}),
      updatedAt: now,
    })
    .where(eq(animal.id, animalId));
};

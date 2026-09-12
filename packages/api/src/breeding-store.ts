import { eq, inArray } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import {
  OPEN_INSTANCE_STATES,
  attemptOf,
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

/** Every service one cow has had, oldest first — the ones that did not take included. */
const everyServiceOf = (tx: Tx, animalId: string): Promise<Served[]> =>
  tx.query.service.findMany({
    where: { animalId },
    columns: { id: true, animalId: true, servedAt: true },
    orderBy: { servedAt: "asc", id: "asc" },
  });

/** Her latest attempt, or none: the only one whose check is still worth making. */
const latestAttemptOf = async (
  tx: Tx,
  animalId: string
): Promise<Served | null> => {
  const services = await everyServiceOf(tx, animalId);
  return attemptsThatBegin(services).at(-1) ?? null;
};

/**
 * The attempt a piece of work was raised by, while it is still her latest and still stands as it was
 * raised — or null. A check is of the attempt that raised it and nothing else: a Vet cannot tell at
 * a glance which of her heats a pregnancy dates from, and the farm can.
 */
export const attemptThatRaisedWork = async (
  tx: Tx,
  animalId: string,
  cause: string | null
): Promise<Served | null> => {
  const latest = await latestAttemptOf(tx, animalId);
  return latest && cause?.startsWith(`${attemptKeyOf(latest)}:`)
    ? latest
    : null;
};

/**
 * Closes the work raised by attempts that no longer call for it.
 *
 * Only her latest attempt's work is worth doing. A Correction that moves the day she was served, or
 * takes the first service back so the second now begins the attempt, leaves work raised on a day or
 * a service that no longer stands. And a cow served again has come back into heat: the attempt
 * before has answered its own question, and its check would send the Vet to confirm a pregnancy
 * that is not there. Only open work — anything already done was done. The attempt as it now stands
 * raises its own on the next pass.
 */
export const closeWorkOfAttemptsNoLongerStanding = async (
  tx: Tx,
  farmId: string,
  animalId: string
): Promise<void> => {
  const latest = await latestAttemptOf(tx, animalId);
  const standing = latest ? `${attemptKeyOf(latest)}:` : null;
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
    (work) => !(standing && work.cause?.startsWith(standing))
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
 * A positive stands until something undoes it. Her latest positive check sets Expected Calving at
 * its attempt's first service carried the farm's gestation on, and makes a Heifer a Pregnant
 * Heifer. A negative takes nothing from her: losing a confirmed pregnancy is an Abortion, recorded as
 * one, not a later check that happens to disagree. The one thing that does undo a positive is that
 * positive being put right — corrected to negative, or taken back — and only the caller knows that.
 * A cow with no positive check is otherwise left as she is: a heifer bought in carrying has her due
 * date from her intake, not from a check this farm never made.
 */
export const rederivePregnancy = async (
  tx: Tx,
  animalId: string,
  {
    gestationDays,
    at,
    now,
    undoingPositive,
  }: { gestationDays: number; at: Date; now: Date; undoingPositive: boolean }
): Promise<void> => {
  const [positive] = await tx.query.pregnancyCheck.findMany({
    where: { animalId, result: "positive" },
    columns: { serviceId: true },
    orderBy: { checkedAt: "desc", id: "desc" },
    limit: 1,
  });
  if (!(positive || undoingPositive)) {
    return;
  }
  const her = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: { state: true },
  });
  const attempt = positive
    ? attemptOf(await everyServiceOf(tx, animalId), positive.serviceId)
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
      expectedCalvingAt: attempt
        ? expectedCalvingFrom(attempt.servedAt, gestationDays)
        : null,
      ...(state && state !== her?.state ? { state, stateChangedAt: at } : {}),
      updatedAt: now,
    })
    .where(eq(animal.id, animalId));
};

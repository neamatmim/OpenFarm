import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { headCount } from "@OpenFarm/db/schema/head-count";
import { isExitState } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";

// The evening Head Count: each Pen counted blind at lock-up, set against the animals the register puts there at that
// moment, and a Pen that does not count right told to the Manager, who walks it and counts again.

type Db = Pick<Database, "query"> | Tx;

/** The furthest back a count that differs is still told: last night's, not one from before the farm counted. */
const TOLD_WITHIN_MS = 24 * 60 * 60 * 1000;

/**
 * The animals the register puts in a Pen at a moment: those whose latest Move by then took them into it, and who had
 * not left the farm by then. Read from the Moves rather than where she stands now, so a count written late — a phone
 * out of signal at lock-up — is set against the Pen as it was, and one walked in before the count is counted there.
 */
export const inThePenAt = async (
  db: Db,
  farmId: string,
  penId: string,
  at: Date
): Promise<{ id: string; tagNumber: string }[]> => {
  const into = await db.query.animalMove.findMany({
    where: { farmId, toPenId: penId, movedAt: { lte: at } },
    columns: { animalId: true },
  });
  const ids = [...new Set(into.map((move) => move.animalId))];
  if (ids.length === 0) {
    return [];
  }
  const moves = await db.query.animalMove.findMany({
    where: { animalId: { in: ids }, movedAt: { lte: at } },
    columns: { animalId: true, toPenId: true },
    orderBy: { movedAt: "asc", id: "asc" },
  });
  const lastPen = new Map<string, string>();
  for (const move of moves) {
    lastPen.set(move.animalId, move.toPenId);
  }
  const animals = await db.query.animal.findMany({
    where: { farmId, id: { in: ids } },
    columns: { id: true, tagNumber: true, state: true, stateChangedAt: true },
    orderBy: { tagNumber: "asc" },
  });
  return animals
    .filter(
      (one) =>
        lastPen.get(one.id) === penId &&
        !(isExitState(one.state) && one.stateChangedAt <= at)
    )
    .map((one) => ({ id: one.id, tagNumber: one.tagNumber }));
};

/**
 * Writes one Pen's count beside what the register put there when it was counted — first time, or counted again by a
 * Correction, which rewrites it and compares again. Whether they differ, and nothing of how many were expected: the
 * count is blind, and the person counting is not told the answer to check against.
 */
export const recordHeadCount = async (
  tx: Tx,
  input: {
    farmId: string;
    penId: string;
    instanceId: string;
    completionId: string;
    counted: number;
    countedAt: Date;
    countedBy: string;
    now: Date;
  }
): Promise<{ differs: boolean }> => {
  const there = await inThePenAt(
    tx,
    input.farmId,
    input.penId,
    input.countedAt
  );
  const expected = there.length;
  const row = {
    counted: input.counted,
    expected,
    expectedIds: there.map((one) => one.id),
    countedAt: input.countedAt,
    countedBy: input.countedBy,
    recordedAt: input.now,
  };
  await tx
    .insert(headCount)
    .values({
      id: uuidv7(input.now),
      farmId: input.farmId,
      penId: input.penId,
      instanceId: input.instanceId,
      completionId: input.completionId,
      ...row,
    })
    .onConflictDoUpdate({ target: headCount.completionId, set: row });
  return { differs: input.counted !== expected };
};

/** A count taken back — the Step put right to a skip — is no count. */
export const removeHeadCount = async (
  tx: Tx,
  completionId: string
): Promise<void> => {
  await tx.delete(headCount).where(eq(headCount.completionId, completionId));
};

/** One Pen whose count does not match the register, as the Manager is told it. */
export interface CountThatDiffers {
  instanceId: string;
  penName: string;
  counted: number;
  expected: number;
}

/** The counts of the last day that do not match the register and that nobody has been told of yet. */
export const countsToTell = async (
  db: Db,
  farmId: string,
  now: Date
): Promise<CountThatDiffers[]> => {
  const recent = await db.query.headCount.findMany({
    where: {
      farmId,
      countedAt: { gte: new Date(now.getTime() - TOLD_WITHIN_MS) },
    },
    columns: { instanceId: true, counted: true, expected: true },
    with: { pen: { columns: { name: true } } },
    orderBy: { countedAt: "asc", id: "asc" },
  });
  const differing = recent.filter((row) => row.counted !== row.expected);
  if (differing.length === 0) {
    return [];
  }
  const told = await db.query.alert.findMany({
    where: {
      farmId,
      kind: "head_count_differs",
      entityId: { in: differing.map((row) => row.instanceId) },
    },
    columns: { entityId: true },
  });
  const said = new Set(told.map((row) => row.entityId));
  return differing
    .filter((row) => !said.has(row.instanceId))
    .map((row) => ({
      instanceId: row.instanceId,
      penName: row.pen.name,
      counted: row.counted,
      expected: row.expected,
    }));
};

/** Tells the Manager of each Pen that did not count right. */
export const tellOfCounts = async (
  tx: Tx,
  farmId: string,
  untold: readonly CountThatDiffers[],
  now: Date
): Promise<Raised[]> => {
  const raised: Raised[] = [];
  const remembering = rememberingPeople();
  for (const one of untold) {
    // Sequential against one unique index, as the other notices are.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await tell(
      tx,
      farmId,
      {
        kind: "head_count_differs",
        about: { id: one.instanceId },
        facts: {
          pen: one.penName,
          counted: one.counted,
          expected: one.expected,
        },
      },
      now,
      remembering
    );
    raised.push(...rows);
  }
  return raised;
};

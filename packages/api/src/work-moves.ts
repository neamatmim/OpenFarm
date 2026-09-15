import { and, eq, inArray } from "@OpenFarm/db/operators";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { WorkMove } from "@OpenFarm/domain";
import { WORK_MOVES, mayMove } from "@OpenFarm/domain";
import type { SQL } from "drizzle-orm";

import type { Tx } from "./audit";
import { lateEntry } from "./late";

/** A piece of work as the trail records it either side of a move: where it stands and whose it is. */
export const readWork = async (tx: Tx, instanceId: string) =>
  (await tx.query.sopInstance.findFirst({
    where: { id: instanceId },
    columns: {
      state: true,
      assignedTo: true,
      claimedBy: true,
      claimedAt: true,
      completedAt: true,
    },
  })) ?? null;

/** Refuses a move the work's state does not allow (WORK_MOVES): late, because it was open when the person began and has
 *  been closed, taken or signed off since. */
export const requireMayMove = (
  work: { state: string },
  move: WorkMove
): void => {
  if (!mayMove(move, work.state)) {
    throw lateEntry(`This work is ${work.state.replaceAll("_", " ")}`, {
      state: work.state,
    });
  }
};

/**
 * Moves a piece of work, writing its new state only if it is still in a state the move may happen from — so of two
 * people signing the same work off, or a finish and a send-back crossing, one moves it and the other finds it moved.
 * Whether it moved; the Audit Event is the business of whoever made the move, on the same transaction.
 */
export const applyMove = async (
  tx: Tx,
  work: { id: string; state: string },
  move: WorkMove,
  {
    set = {},
    onlyIf,
  }: {
    /** What else the move writes: who claimed it, when it was completed. */
    set?: Partial<typeof sopInstance.$inferInsert>;
    /** A further condition the work must still meet — nobody holding it, for a claim. */
    onlyIf?: SQL;
  } = {}
): Promise<boolean> => {
  requireMayMove(work, move);
  const { from, to } = WORK_MOVES[move];
  const [moved] = await tx
    .update(sopInstance)
    .set({ ...set, ...(to ? { state: to } : {}) })
    .where(
      and(
        eq(sopInstance.id, work.id),
        inArray(sopInstance.state, [...from]),
        onlyIf
      )
    )
    .returning({ id: sopInstance.id });
  return moved !== undefined;
};

/** Moves a piece of work, or refuses as late when somebody moved it first. */
export const requireMove = async (
  tx: Tx,
  work: { id: string; state: string },
  move: WorkMove,
  options: Parameters<typeof applyMove>[3] = {}
): Promise<void> => {
  if (!(await applyMove(tx, work, move, options))) {
    throw lateEntry("This work changed while you were on it");
  }
};

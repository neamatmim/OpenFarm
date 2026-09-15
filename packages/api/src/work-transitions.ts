import { and, eq, inArray } from "@OpenFarm/db/operators";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { WorkTransition } from "@OpenFarm/domain";
import { WORK_TRANSITIONS, mayTransition } from "@OpenFarm/domain";
import type { SQL } from "drizzle-orm";

import type { Trail, Tx } from "./audit";
import { lateEntry } from "./late";

/** A piece of work as the trail records it either side of a transition: where it stands and whose it is. */
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

/** Refuses a transition the work's state does not allow (WORK_TRANSITIONS): late, because it was open when the person began and has
 *  been closed, taken or signed off since. */
export const requireMayTransition = (
  work: { state: string },
  transition: WorkTransition
): void => {
  if (!mayTransition(transition, work.state)) {
    throw lateEntry(`This work is ${work.state.replaceAll("_", " ")}`, {
      state: work.state,
    });
  }
};

/**
 * Moves a piece of work, writing its new state only if it is still in a state the transition may happen from — so of two
 * people signing the same work off, or a finish and a send-back crossing, one transitions it and the other finds it moved.
 * Whether it moved; the Audit Event is the business of whoever made the transition, on the same transaction.
 */
export const applyTransition = async (
  tx: Tx,
  work: { id: string; state: string },
  transition: WorkTransition,
  {
    set = {},
    onlyIf,
  }: {
    /** What else the transition writes: who claimed it, when it was completed. */
    set?: Partial<typeof sopInstance.$inferInsert>;
    /** A further condition the work must still meet — nobody holding it, for a claim. */
    onlyIf?: SQL;
  } = {}
): Promise<boolean> => {
  requireMayTransition(work, transition);
  const { from, to } = WORK_TRANSITIONS[transition];
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
export const requireTransition = async (
  tx: Tx,
  work: { id: string; state: string },
  transition: WorkTransition,
  options: Parameters<typeof applyTransition>[3] = {}
): Promise<void> => {
  if (!(await applyTransition(tx, work, transition, options))) {
    throw lateEntry("This work changed while you were on it");
  }
};

/**
 * What called work off: named in each piece's trail, so a board that no longer shows the morning's dose can say why.
 */
export type CalledOffBy =
  | "animal_left"
  | "heat_withdrawn"
  | "attempt_no_longer_standing"
  | "calving_no_longer_expected"
  | "report_withdrawn";

/** What raised called-off work again. */
export type RaisedAgainBy = "calving_expected_again";

/**
 * Calls off the open work that matches (the glossary's Called Off): the farm no longer owes it. Each piece is moved on
 * its own guarded write and gets its own Audit Event, in the trail of the request that called it off, naming what did;
 * work done and awaiting sign-off is left, and so is work already closed. The ids of the work called off.
 */
export const callOffWork = async (
  tx: Tx,
  farmId: string,
  which: SQL,
  { trail, by }: { trail: Trail; by: CalledOffBy }
): Promise<string[]> => {
  const open = await tx
    .select({ id: sopInstance.id, state: sopInstance.state })
    .from(sopInstance)
    .where(
      and(
        eq(sopInstance.farmId, farmId),
        inArray(sopInstance.state, [...WORK_TRANSITIONS.callOff.from]),
        which
      )
    )
    .orderBy(sopInstance.id);
  const called: string[] = [];
  for (const work of open) {
    // Sequential: one guarded write and one trail entry for each piece of work.
    // oxlint-disable-next-line no-await-in-loop
    if (await applyTransition(tx, work, "callOff")) {
      // oxlint-disable-next-line no-await-in-loop
      await trail(tx, {
        entity: "sop_instance",
        entityId: work.id,
        action: "update",
        before: { state: work.state },
        after: { state: WORK_TRANSITIONS.callOff.to, calledOffBy: by },
      });
      called.push(work.id);
    }
  }
  return called;
};

/**
 * Raises again work that was called off, now its cause has come back — her calving expected again, on a new day. Work
 * the Manager closed as Missed stays closed. Whether it came back.
 */
export const raiseWorkAgain = async (
  tx: Tx,
  work: { id: string; state: string; dueAt: Date },
  { trail, dueAt, by }: { trail: Trail; dueAt: Date; by: RaisedAgainBy }
): Promise<boolean> => {
  const raised = await applyTransition(tx, work, "raiseAgain", {
    set: { dueAt, claimedBy: null, claimedAt: null },
  });
  if (raised) {
    await trail(tx, {
      entity: "sop_instance",
      entityId: work.id,
      action: "update",
      before: { state: work.state, dueAt: work.dueAt.toISOString() },
      after: {
        state: WORK_TRANSITIONS.raiseAgain.to,
        dueAt: dueAt.toISOString(),
        raisedAgainBy: by,
      },
    });
  }
  return raised;
};

import { eq, inArray } from "@OpenFarm/db/operators";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { CalvingLead } from "@OpenFarm/domain";
import { calvingWorkDue, isOpen, mayMove } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import {
  calvingCauseParts,
  calvingKeyOf,
  calvingWorkPrefix,
} from "./instances-store";
import type { Who } from "./work-moves";
import { callOffWork, raiseWorkAgain } from "./work-moves";

/** What following a changed Expected Calving did to the work about her, for the trail. */
export interface CalvingWorkFollowed {
  workMoved: { instanceId: string; from: Date; to: Date }[];
  workClosed: string[];
  /** Work closed when a calving stopped being expected, back now that it is again. */
  workReopened: string[];
}

/** Nothing followed: no calving work moved, closed or came back. */
export const nothingFollowed = (): CalvingWorkFollowed => ({
  workMoved: [],
  workClosed: [],
  workReopened: [],
});

/** What the calving work about one cow is keyed on, and when it falls. */
export interface CalvingOf {
  id: string;
  farmId: string;
  lactationNumber: number;
  expectedCalvingAt: Date | null;
}

/**
 * Takes her calving work to where her Expected Calving now is.
 *
 * The Owner's decision (2026-09-13): if the date moves, the work moves with it. Work still open goes
 * to its new day; work already done stays done, and is never raised a second time because its key is
 * the calving, not the date or where the date came from. With no calving expected — a positive put
 * right, or a calving recorded — the open work closes. And when a calving is expected again, in the
 * same Lactation, the work that closed comes back on its new day rather than being lost: a positive
 * corrected away and then corrected back is the same calving. Returned, so the trail says which work
 * went where.
 */
export const followExpectedCalving = async (
  tx: Tx,
  her: CalvingOf,
  leadDays: Record<CalvingLead, number>,
  {
    expectedAgain,
    who,
  }: {
    expectedAgain: boolean;
    /** Who changed her calving, as the trail of the work it calls off or raises again names them. */
    who: Who;
  }
): Promise<CalvingWorkFollowed> => {
  const calvingWork = await tx.query.sopInstance.findMany({
    where: {
      farmId: her.farmId,
      animalId: her.id,
      cause: { like: `${calvingWorkPrefix(her.id)}%` },
    },
    columns: { id: true, cause: true, dueAt: true, state: true },
    orderBy: { dueAt: "asc", id: "asc" },
  });
  const followed = nothingFollowed();
  const key = calvingKeyOf(her);
  for (const work of calvingWork) {
    const parts = calvingCauseParts(work.cause);
    const open = isOpen(work.state);
    if (!parts) {
      continue;
    }
    const thisCalving = her.expectedCalvingAt !== null && parts.key === key;
    if (open && !thisCalving) {
      followed.workClosed.push(work.id);
      continue;
    }
    // Only work her calving called off comes back: work the Manager closed as Missed stays closed.
    const comesBack =
      expectedAgain && mayMove("raiseAgain", work.state) && thisCalving;
    if (!((open || comesBack) && her.expectedCalvingAt)) {
      continue;
    }
    const to = calvingWorkDue(her.expectedCalvingAt, leadDays[parts.lead]);
    if (comesBack) {
      // Sequential: one row each, and the trail reads them back in the order they went.
      // oxlint-disable-next-line no-await-in-loop
      if (await raiseWorkAgain(tx, her.farmId, work, { who, dueAt: to })) {
        followed.workReopened.push(work.id);
      }
      continue;
    }
    if (to.getTime() === work.dueAt.getTime()) {
      continue;
    }
    followed.workMoved.push({ instanceId: work.id, from: work.dueAt, to });
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(sopInstance)
      .set({ dueAt: to })
      .where(eq(sopInstance.id, work.id));
  }
  if (followed.workClosed.length > 0) {
    await callOffWork(
      tx,
      her.farmId,
      inArray(sopInstance.id, followed.workClosed),
      { who, by: "calving_no_longer_expected" }
    );
  }
  return followed;
};

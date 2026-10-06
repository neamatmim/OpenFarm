import { and, eq, inArray, isNull } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";

import type { Turning } from "./the-day-turns";
import { backupGap } from "./the-machinery-notices";

// A notice whose cause has gone says something no longer true: late work since done, an animal since Found, a backup
// taken since. Left up, it is tapped away by hand or it pushes what is still true off the list. Each sweep clears what
// is settled (the Owner's decision, 2026-10-06) — dismissed as if read, never deleted: the notice was true when raised.

/** The work states in which work is no longer owed: done, approved, missed and closed, or called off. */
const WORK_OVER = new Set(["completed", "approved", "missed", "called_off"]);

/** The notices still showing, of these kinds, with what they are about and when they were raised. */
const showing = (
  context: Turning,
  kinds: (
    | "instance_overdue"
    | "instance_escalated"
    | "animal_missing"
    | "backup_overdue"
    | "day_not_turning"
  )[]
) =>
  context.db.query.alert.findMany({
    where: {
      farmId: context.farm.id,
      kind: { in: kinds },
      dismissedAt: { isNull: true },
    },
    columns: { id: true, kind: true, entityId: true, createdAt: true },
  });

/** Clears these notices, as read now. */
const clear = async (context: Turning, ids: readonly string[], now: Date) => {
  if (ids.length === 0) {
    return;
  }
  await context.db
    .update(alert)
    .set({ dismissedAt: now })
    .where(
      and(
        eq(alert.farmId, context.farm.id),
        inArray(alert.id, [...ids]),
        isNull(alert.dismissedAt)
      )
    );
};

/**
 * Clears the notices the farm has since put right: late or escalated work since done or called off; a Missing animal
 * since Found or written off; a backup alarm once a copy is good again; a day-turning alarm once a turn has gone whole
 * since it was raised. Nothing on the trail: it is the notices catching up with records that are already there.
 */
export const settleWhatIsSettled = async (context: Turning) => {
  const now = context.clock.now();
  const open = await showing(context, [
    "instance_overdue",
    "instance_escalated",
    "animal_missing",
    "backup_overdue",
    "day_not_turning",
  ]);
  if (open.length === 0) {
    return;
  }
  const aboutWork = open.filter(
    (one) =>
      one.kind === "instance_overdue" || one.kind === "instance_escalated"
  );
  const aboutMissing = open.filter((one) => one.kind === "animal_missing");
  const [work, missing, backupStillLate, schedule] = await Promise.all([
    aboutWork.length === 0
      ? []
      : context.db.query.sopInstance.findMany({
          where: {
            farmId: context.farm.id,
            id: { in: aboutWork.map((one) => one.entityId) },
          },
          columns: { id: true, state: true },
        }),
    aboutMissing.length === 0
      ? []
      : context.db.query.missing.findMany({
          where: {
            farmId: context.farm.id,
            id: { in: aboutMissing.map((one) => one.entityId) },
          },
          columns: { id: true, foundAt: true, writtenOffAt: true },
        }),
    open.some((one) => one.kind === "backup_overdue")
      ? backupGap(context.db, now)
      : null,
    // When the day last turned whole: a day-turning alarm raised before it is over.
    context.db.query.schedulerState.findFirst({
      where: { id: "farm-day" },
      columns: { lastOkAt: true },
    }),
  ]);
  const lastTurnedWholeAt = schedule?.lastOkAt ?? null;
  const workOver = new Set(
    work.filter((one) => WORK_OVER.has(one.state)).map((one) => one.id)
  );
  const missingOver = new Set(
    missing
      .filter((one) => one.foundAt !== null || one.writtenOffAt !== null)
      .map((one) => one.id)
  );
  const settled = open.filter((one) => {
    switch (one.kind) {
      case "instance_overdue":
      case "instance_escalated": {
        return workOver.has(one.entityId);
      }
      case "animal_missing": {
        return missingOver.has(one.entityId);
      }
      case "backup_overdue": {
        return backupStillLate === null;
      }
      default: {
        return lastTurnedWholeAt !== null && lastTurnedWholeAt > one.createdAt;
      }
    }
  });
  await clear(
    context,
    settled.map((one) => one.id),
    now
  );
};

import { and, eq, inArray, isNull } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import { farmDayOf } from "@OpenFarm/domain";

import { whatTheStoreHasToSay } from "./lot-notices";
import { overdueKey, overdueReceivable } from "./receivable-store";
import { lowStockNoticeId, runningLow } from "./stock-store";
import type { Turning } from "./the-day-turns";
import { backupGap, monthlyCopyFailed } from "./the-machinery-notices";

// A notice whose cause has gone says something no longer true: late work since done, an animal since Found, a backup
// taken since. Left up, it is tapped away by hand or it pushes what is still true off the list. Each sweep clears what
// is settled (the Owner's decision, 2026-10-06) — dismissed as if read, never deleted: the notice was true when raised.

/** The work states in which work is no longer owed: done, approved, missed and closed, or called off. */
const WORK_OVER = new Set(["completed", "approved", "missed", "called_off"]);

/** The kinds a sweep can see the cause of again, and clears once it is gone. */
const SETTLED_BY_THE_SWEEP = [
  "instance_overdue",
  "instance_escalated",
  "animal_missing",
  "backup_overdue",
  "day_not_turning",
  "needs_review",
  "receivable_overdue",
  "monthly_copy_failed",
  "low_stock",
  "medicine_low_stock",
  "lot_expiring",
  "lot_expired",
] as const;

/** The notices still showing, of these kinds, with what they are about and when they were raised. */
const showing = (
  context: Turning,
  kinds: (typeof SETTLED_BY_THE_SWEEP)[number][]
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
 * Of the notices whose cause the farm can ask again, which it would still raise now, as `kind|entityId`. Each kind's
 * question is asked only when one of its notices is showing: every sweep runs this.
 */
const whatIsStillSo = async (
  context: Turning,
  open: readonly { kind: string; entityId: string }[],
  now: Date
): Promise<Set<string>> => {
  const has = (...kinds: string[]) =>
    open.some((one) => kinds.includes(one.kind));
  const still = new Set<string>();
  const say = (kind: string, ids: Iterable<string>) => {
    for (const id of ids) {
      still.add(`${kind}|${id}`);
    }
  };
  if (has("needs_review")) {
    const unresolved = await context.db.query.needsReview.findMany({
      where: {
        farmId: context.farm.id,
        entityId: {
          in: open
            .filter((one) => one.kind === "needs_review")
            .map((one) => one.entityId),
        },
        resolvedAt: { isNull: true },
      },
      columns: { entityId: true },
    });
    say(
      "needs_review",
      unresolved.map((one) => one.entityId)
    );
  }
  if (has("receivable_overdue")) {
    const overdue = await overdueReceivable(
      context.db,
      context.farm,
      farmDayOf(now)
    );
    say(
      "receivable_overdue",
      overdue.flatMap((buyer) => buyer.items.map((item) => overdueKey(item)))
    );
  }
  if (has("monthly_copy_failed")) {
    const failed = await monthlyCopyFailed(context.db, now);
    say("monthly_copy_failed", failed ? [failed.id] : []);
  }
  if (has("low_stock")) {
    const low = await runningLow(context.db, context.farm, now);
    say(
      "low_stock",
      low.map((one) => lowStockNoticeId(one))
    );
  }
  if (has("medicine_low_stock", "lot_expiring", "lot_expired")) {
    const said = await whatTheStoreHasToSay(context.db, context.farm, now);
    for (const one of said) {
      say(one.kind, [one.id]);
    }
  }
  return still;
};

/**
 * Clears the notices the farm has since put right: late or escalated work since done or called off; a Missing animal
 * since Found or written off; a backup alarm once a copy is good again; a day-turning alarm once a turn has gone whole
 * since it was raised. Nothing on the trail: it is the notices catching up with records that are already there.
 */
export const settleWhatIsSettled = async (context: Turning) => {
  const now = context.clock.now();
  const open = await showing(context, [...SETTLED_BY_THE_SWEEP]);
  if (open.length === 0) {
    return;
  }
  const stillSo = await whatIsStillSo(context, open, now);
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
  // Found, written off — or no longer there at all: a Missing a Correction took back is deleted, and its red notice stood
  // for good because nothing could find it to ask.
  const stillThere = new Set(missing.map((one) => one.id));
  const missingOver = new Set([
    ...missing
      .filter((one) => one.foundAt !== null || one.writtenOffAt !== null)
      .map((one) => one.id),
    ...aboutMissing
      .map((one) => one.entityId)
      .filter((id) => !stillThere.has(id)),
  ]);
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
      case "day_not_turning": {
        return lastTurnedWholeAt !== null && lastTurnedWholeAt > one.createdAt;
      }
      default: {
        // Asked of what the farm would say now: a review dealt with, a debt paid or written off, a good monthly copy
        // since, a store stocked again or a Lot used up — no longer said, so no longer showing.
        return !stillSo.has(`${one.kind}|${one.entityId}`);
      }
    }
  });
  await clear(
    context,
    settled.map((one) => one.id),
    now
  );
};

import { and, eq, inArray, isNull } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import { farmDayOf } from "@OpenFarm/domain";

import { withdrawalNoticeId } from "./health-store";
import { whatTheStoreHasToSay } from "./lot-notices";
import { stillMissed } from "./monthly-sums-store";
import { overdueKey, overdueReceivable } from "./receivable-store";
import { soresStillSeen } from "./sores-store";
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
  "reimbursement_due",
  "monthly_sum_missed",
  "investor_statement_due",
  "withdrawal_ending",
  "pen_sores_seen",
] as const;

/** The Venture states in which a month's Reimbursement is still asked for. */
const RUNNING_VENTURES: ReadonlySet<string> = new Set([
  "buying",
  "fattening",
  "selling",
]);

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

/** A notice still showing, as the sweep asks about it. */
interface Open {
  kind: string;
  entityId: string;
  createdAt: Date;
}

/** One question the sweep asks again: which of these notices, of its kinds, the farm would still raise now, as
 *  `kind|entityId`. */
interface Asker {
  kinds: readonly string[];
  ask: (
    context: Turning,
    open: readonly Open[],
    now: Date
  ) => Promise<Iterable<string>>;
}

const keysOf = (kind: string, ids: Iterable<string>) =>
  [...ids].map((id) => `${kind}|${id}`);

/** A Reimbursement still owed: its Venture still running, not settled, and nothing repaid for that month. */
const reimbursementsStillOwed: Asker["ask"] = async (context, open) => {
  const asked = open.map((one) => {
    const at = one.entityId.lastIndexOf(":");
    return {
      id: one.entityId,
      ventureId: one.entityId.slice(0, at),
      month: one.entityId.slice(at + 1),
    };
  });
  const ventureIds = [...new Set(asked.map((one) => one.ventureId))];
  const [ventures, settled, repaid] = await Promise.all([
    context.db.query.venture.findMany({
      where: { farmId: context.farm.id, id: { in: ventureIds } },
      columns: { id: true, state: true },
    }),
    context.db.query.ventureSettlement.findMany({
      where: { farmId: context.farm.id, ventureId: { in: ventureIds } },
      columns: { ventureId: true },
    }),
    context.db.query.ventureMovement.findMany({
      where: {
        farmId: context.farm.id,
        ventureId: { in: ventureIds },
        kind: "reimbursement",
      },
      columns: { ventureId: true, forMonth: true },
    }),
  ]);
  const running = new Set(
    ventures
      .filter((one) => RUNNING_VENTURES.has(one.state))
      .map((one) => one.id)
  );
  const closed = new Set(settled.map((one) => one.ventureId));
  const paidFor = new Set(
    repaid.map((one) => `${one.ventureId}:${one.forMonth}`)
  );
  return keysOf(
    "reimbursement_due",
    asked
      .filter(
        (one) =>
          running.has(one.ventureId) &&
          !closed.has(one.ventureId) &&
          !paidFor.has(`${one.ventureId}:${one.month}`)
      )
      .map((one) => one.id)
  );
};

/** A Venture's progress paper still due: the Venture still running, and the paper not yet made for every one of its
 *  Investors since the notice was raised. */
const papersStillDue: Asker["ask"] = async (context, open) => {
  const still: string[] = [];
  for (const one of open) {
    const ventureId = one.entityId.slice(0, one.entityId.indexOf(":"));
    // oxlint-disable-next-line no-await-in-loop -- a Venture or two at a time
    const venture = await context.db.query.venture.findFirst({
      where: { farmId: context.farm.id, id: ventureId },
      columns: { state: true },
    });
    // Settled or called off since: its books are shut, and no progress paper is owed.
    if (!(venture && RUNNING_VENTURES.has(venture.state))) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- as above
    const agreements = await context.db.query.investmentAgreement.findMany({
      where: { farmId: context.farm.id, ventureId },
      columns: { id: true, investorId: true },
    });
    const people = agreements.filter(
      (agreement) => agreement.investorId !== null
    );
    // oxlint-disable-next-line no-await-in-loop -- as above
    const made = await context.db.query.auditEvent.findMany({
      where: {
        farmId: context.farm.id,
        entity: "investment_agreement",
        entityId: { in: people.map((agreement) => agreement.id) },
        action: "export",
        receivedAt: { gte: one.createdAt },
      },
      columns: { entityId: true, after: true },
    });
    const sent = new Set(
      made
        .filter(
          (event) =>
            (event.after as { paper?: unknown } | null)?.paper ===
            "progress_statement"
        )
        .map((event) => event.entityId)
    );
    if (
      people.length === 0 ||
      people.some((agreement) => !sent.has(agreement.id))
    ) {
      still.push(one.entityId);
    }
  }
  return keysOf("investor_statement_due", still);
};

/** A hold still ending when it was said to: lengthened by a later dose, or shortened, the day it named has gone. */
const holdsStillEnding: Asker["ask"] = async (context, open) => {
  const animalIds = [
    ...new Set(
      open.map((one) => one.entityId.slice(0, one.entityId.indexOf(":")))
    ),
  ];
  const held = await context.db.query.animal.findMany({
    where: { farmId: context.farm.id, id: { in: animalIds } },
    columns: { id: true, milkWithdrawalUntil: true },
  });
  return keysOf(
    "withdrawal_ending",
    held.flatMap((her) =>
      her.milkWithdrawalUntil
        ? [withdrawalNoticeId(her.id, her.milkWithdrawalUntil)]
        : []
    )
  );
};

/** The kinds whose cause the sweep can ask again, each with its question. */
const ASKERS: readonly Asker[] = [
  {
    kinds: ["needs_review"],
    ask: async (context, open) => {
      const unresolved = await context.db.query.needsReview.findMany({
        where: {
          farmId: context.farm.id,
          entityId: { in: open.map((one) => one.entityId) },
          resolvedAt: { isNull: true },
        },
        columns: { entityId: true },
      });
      return keysOf(
        "needs_review",
        unresolved.map((one) => one.entityId)
      );
    },
  },
  {
    kinds: ["receivable_overdue"],
    ask: async (context, _open, now) => {
      const overdue = await overdueReceivable(
        context.db,
        context.farm,
        farmDayOf(now)
      );
      return keysOf(
        "receivable_overdue",
        overdue.flatMap((buyer) => buyer.items.map((item) => overdueKey(item)))
      );
    },
  },
  {
    kinds: ["monthly_copy_failed"],
    ask: async (context, _open, now) => {
      const failed = await monthlyCopyFailed(context.db, now);
      return keysOf("monthly_copy_failed", failed ? [failed.id] : []);
    },
  },
  {
    kinds: ["low_stock"],
    ask: async (context, _open, now) => {
      const low = await runningLow(context.db, context.farm, now);
      return keysOf(
        "low_stock",
        low.map((one) => lowStockNoticeId(one))
      );
    },
  },
  {
    kinds: ["medicine_low_stock", "lot_expiring", "lot_expired"],
    ask: async (context, _open, now) => {
      const said = await whatTheStoreHasToSay(context.db, context.farm, now);
      return said.map((one) => `${one.kind}|${one.id}`);
    },
  },
  { kinds: ["reimbursement_due"], ask: reimbursementsStillOwed },
  {
    kinds: ["monthly_sum_missed"],
    ask: async (context, _open, now) =>
      keysOf(
        "monthly_sum_missed",
        await stillMissed(context.db, context.farm.id, farmDayOf(now))
      ),
  },
  { kinds: ["investor_statement_due"], ask: papersStillDue },
  { kinds: ["withdrawal_ending"], ask: holdsStillEnding },
  {
    kinds: ["pen_sores_seen"],
    ask: async (context, open) =>
      keysOf(
        "pen_sores_seen",
        await soresStillSeen(
          context.db,
          context.farm,
          open.map((one) => one.entityId)
        )
      ),
  },
];

/**
 * Of the notices whose cause the farm can ask again, which it would still raise now, as `kind|entityId`. Each kind's
 * question is asked only when one of its notices is showing: every sweep runs this.
 */
const whatIsStillSo = async (
  context: Turning,
  open: readonly Open[],
  now: Date
): Promise<Set<string>> => {
  const still = new Set<string>();
  for (const { kinds, ask } of ASKERS) {
    const theirs = open.filter((one) => kinds.includes(one.kind));
    if (theirs.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- one question at a time, on one connection
      for (const key of await ask(context, theirs, now)) {
        still.add(key);
      }
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

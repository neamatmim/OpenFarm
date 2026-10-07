import { and, eq, inArray, isNull } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import type { AlertKind } from "@OpenFarm/domain";
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

/** The Venture states in which a month's Reimbursement is still asked for. */
const RUNNING_VENTURES: ReadonlySet<string> = new Set([
  "buying",
  "fattening",
  "selling",
]);

/** The notices still showing, of these kinds, with what they are about and when they were raised. */
const showing = (context: Turning, kinds: readonly AlertKind[]) =>
  context.db.query.alert.findMany({
    where: {
      farmId: context.farm.id,
      kind: { in: [...kinds] },
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

/** The question the sweep asks again of a kind: which of these notices the farm would still raise now, as
 *  `kind|entityId`. Asked only while one of them is showing. */
type StillSo = (
  context: Turning,
  open: readonly Open[],
  now: Date
) => Promise<Iterable<string>>;

const keysOf = (kind: string, ids: Iterable<string>) =>
  [...ids].map((id) => `${kind}|${id}`);

const keyOf = (one: Open) => `${one.kind}|${one.entityId}`;

/** Late or escalated work still owed: not done, approved, missed and closed, or called off. Work that is not there at
 *  all is not said to be over. */
const workStillOwed: StillSo = async (context, open) => {
  const work = await context.db.query.sopInstance.findMany({
    where: {
      farmId: context.farm.id,
      id: { in: open.map((one) => one.entityId) },
    },
    columns: { id: true, state: true },
  });
  const over = new Set(
    work.filter((one) => WORK_OVER.has(one.state)).map((one) => one.id)
  );
  return open.filter((one) => !over.has(one.entityId)).map(keyOf);
};

/** A Missing animal still missing: neither Found nor written off — nor gone, as a Missing a Correction took back is
 *  deleted, and its red notice once stood for good because nothing could find it to ask. */
const stillMissing: StillSo = async (context, open) => {
  const missing = await context.db.query.missing.findMany({
    where: {
      farmId: context.farm.id,
      id: { in: open.map((one) => one.entityId) },
    },
    columns: { id: true, foundAt: true, writtenOffAt: true },
  });
  const still = new Set(
    missing
      .filter((one) => one.foundAt === null && one.writtenOffAt === null)
      .map((one) => one.id)
  );
  return open.filter((one) => still.has(one.entityId)).map(keyOf);
};

/** A backup still late: no good copy since. */
const backupStillLate: StillSo = async (context, open, now) =>
  (await backupGap(context.db, now)) === null ? [] : open.map(keyOf);

/** The day still not turning: no whole turn since the alarm was raised. */
const dayStillNotTurning: StillSo = async (context, open) => {
  const schedule = await context.db.query.schedulerState.findFirst({
    where: { id: "farm-day" },
    columns: { lastOkAt: true },
  });
  const lastTurnedWholeAt = schedule?.lastOkAt ?? null;
  return open
    .filter(
      (one) => lastTurnedWholeAt === null || lastTurnedWholeAt <= one.createdAt
    )
    .map(keyOf);
};

/** A Reimbursement still owed: its Venture still running, not settled, and nothing repaid for that month. */
const reimbursementsStillOwed: StillSo = async (context, open) => {
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
const papersStillDue: StillSo = async (context, open) => {
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
const holdsStillEnding: StillSo = async (context, open) => {
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

/** What the store would say now: a feed or a medicine low, a Lot near its day or past it. One question for the three. */
const storeStillSays: StillSo = async (context, _open, now) => {
  const said = await whatTheStoreHasToSay(context.db, context.farm, now);
  return said.map((one) => `${one.kind}|${one.id}`);
};

/**
 * Every kind a sweep can see the cause of again, with its question; it clears a notice once the answer no longer names
 * it. A kind added here without a question does not compile — once, a kind on the sweep's list with no question was
 * cleared the moment it was raised, by the silence of an answer nobody asked.
 */
const QUESTIONS = {
  instance_overdue: workStillOwed,
  instance_escalated: workStillOwed,
  animal_missing: stillMissing,
  backup_overdue: backupStillLate,
  day_not_turning: dayStillNotTurning,
  needs_review: async (context, open) => {
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
  receivable_overdue: async (context, _open, now) => {
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
  monthly_copy_failed: async (context, _open, now) => {
    const failed = await monthlyCopyFailed(context.db, now);
    return keysOf("monthly_copy_failed", failed ? [failed.id] : []);
  },
  low_stock: async (context, _open, now) => {
    const low = await runningLow(context.db, context.farm, now);
    return keysOf(
      "low_stock",
      low.map((one) => lowStockNoticeId(one))
    );
  },
  medicine_low_stock: storeStillSays,
  lot_expiring: storeStillSays,
  lot_expired: storeStillSays,
  reimbursement_due: reimbursementsStillOwed,
  monthly_sum_missed: async (context, _open, now) =>
    keysOf(
      "monthly_sum_missed",
      await stillMissed(context.db, context.farm.id, farmDayOf(now))
    ),
  investor_statement_due: papersStillDue,
  withdrawal_ending: holdsStillEnding,
  pen_sores_seen: async (context, open) =>
    keysOf(
      "pen_sores_seen",
      await soresStillSeen(
        context.db,
        context.farm,
        open.map((one) => one.entityId)
      )
    ),
} as const satisfies Partial<Record<AlertKind, StillSo>>;

/** The kinds a sweep clears once their cause is gone. */
export const SETTLED_BY_THE_SWEEP = Object.keys(
  QUESTIONS
) as (keyof typeof QUESTIONS)[];

/**
 * Of the notices still showing, which the farm would still raise now, as `kind|entityId`. Each question is asked once,
 * of all its kinds' notices together, and only when one of them is showing: every sweep runs this.
 */
const whatIsStillSo = async (
  context: Turning,
  open: readonly Open[],
  now: Date
): Promise<Set<string>> => {
  const byQuestion = new Map<StillSo, Open[]>();
  for (const one of open) {
    const question = (QUESTIONS as Partial<Record<string, StillSo>>)[one.kind];
    if (question) {
      byQuestion.set(question, [...(byQuestion.get(question) ?? []), one]);
    }
  }
  const still = new Set<string>();
  for (const [question, theirs] of byQuestion) {
    // oxlint-disable-next-line no-await-in-loop -- one question at a time, on one connection
    for (const key of await question(context, theirs, now)) {
      still.add(key);
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
  const settled = open.filter((one) => !stillSo.has(keyOf(one)));
  await clear(
    context,
    settled.map((one) => one.id),
    now
  );
};

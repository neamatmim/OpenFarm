import type { Database } from "@OpenFarm/db";
import {
  farmDayOf,
  monthBefore,
  monthOf,
  monthsFromTo,
  roundMoney,
  startOfFarmDay,
  WHAT_THE_FARM_IS_OWED,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import type { FarmCosts } from "./cost-store";
import { consumedBy, farmCosts, owedByMonth } from "./cost-store";
import { tell, whoHears } from "./notice";
import { ownedThenByOf } from "./venture-store";

type Reader = Pick<Database | Tx, "query">;

/** The Ventures whose animals the Farm is feeding: not one still Open, which has bought nothing, nor one whose run is
 *  over. */
const RUNNING = ["buying", "fattening", "selling"] as const;

/**
 * One month's Reimbursement as the farm works it out: what a Venture's Animals consumed that month of what the Farm
 * bought, and, besides its own, every earlier month already repaid whose figure has moved since, more or less — a cost
 * that landed late, or a Correction — so it reaches the Farm with this transfer and no month is paid for twice.
 *
 * Charged by who owned her the day she ate it. One place, because the Owner's sheet, the transfer itself and the
 * evening's post that says one is due must never work out three different figures.
 */
export const aMonthsReimbursement = async (
  db: Reader,
  farmId: string,
  ventureId: string,
  month: string,
  /** The farm's costing and who owned whom when, where the caller already has them: a sweep over every Venture
   *  works the costing out once. */
  known?: {
    costs: FarmCosts;
    ownedThenBy: (animalId: string, at: Date) => string | null;
  }
) => {
  const ownedThenBy =
    known?.ownedThenBy ?? (await ownedThenByOf(db as Tx, farmId));
  const costs = known?.costs ?? (await farmCosts(db as Tx, farmId));
  const consumed = consumedBy(
    costs,
    ownedThenBy,
    ventureId,
    monthOf(startOfFarmDay(`${month}-01`))
  );
  const [run, repaid] = await Promise.all([
    db.query.venture.findFirst({
      where: { id: ventureId, farmId },
      columns: { createdAt: true },
    }),
    db.query.ventureMovement.findMany({
      where: { farmId, ventureId, kind: "reimbursement" },
      columns: { forMonth: true, amountMoney: true, carried: true },
    }),
  ]);
  const earlier = run
    ? monthsFromTo(farmDayOf(run.createdAt).slice(0, 7), month).filter(
        (one) => one < month
      )
    : [];
  const carrying = owedByMonth(
    costs,
    ownedThenBy,
    ventureId,
    earlier,
    repaid
  ).filter((one) => one.repaid && one.stillOwedMoney !== 0);
  const carried = carrying.map((one) => ({
    month: one.month,
    amount: one.stillOwedMoney,
  }));
  return {
    consumed,
    carried,
    /** Whether the month has had a Reimbursement of its own already. */
    repaid: repaid.some((one) => one.forMonth === month),
    /** What the transfer comes to: its own figure and every carried line. */
    totalMoney: roundMoney(
      consumed.totalMoney + carried.reduce((sum, line) => sum + line.amount, 0)
    ),
    /** Kilos nothing can price and doses nothing can cost, in the month or in a month it carries: it waits for them. */
    unpricedKg: carrying.reduce(
      (sum, one) => sum + one.unpricedKg,
      consumed.unpricedKg
    ),
    uncostedDoses: carrying.reduce(
      (sum, one) => sum + one.uncostedDoses,
      consumed.uncostedDoses
    ),
  };
};

/**
 * What each of these Ventures owes the Farm today: every month it ran not yet repaid, this month so far, and what
 * months already repaid have moved by since — money its account still holds that is the Farm's, so not money left to
 * keep its animals with. The farm's costing is worked out once for the lot, and not at all when none is running.
 */
export const owedTheFarmByEach = async (
  db: Reader,
  farmId: string,
  ventures: readonly { id: string; state: string; createdAt: Date }[],
  today: string
): Promise<Map<string, number>> => {
  const owed = new Map<string, number>();
  const running = ventures.filter((one) =>
    (RUNNING as readonly string[]).includes(one.state)
  );
  if (running.length === 0) {
    return owed;
  }
  const [costs, ownedThenBy, repaid] = await Promise.all([
    farmCosts(db as Tx, farmId),
    ownedThenByOf(db as Tx, farmId),
    db.query.ventureMovement.findMany({
      where: {
        farmId,
        ventureId: { in: running.map((one) => one.id) },
        kind: "reimbursement",
      },
      columns: {
        ventureId: true,
        forMonth: true,
        amountMoney: true,
        carried: true,
      },
    }),
  ]);
  // Each charge's owner then asked once for every running Venture together, not once by each of them.
  const runningIds = new Set(running.map((one) => one.id));
  const byOwner = new Map<string, FarmCosts["charges"]>();
  for (const one of costs.charges) {
    if (!WHAT_THE_FARM_IS_OWED.has(one.kind)) {
      continue;
    }
    const owner = ownedThenBy(one.animalId, one.at);
    if (owner !== null && runningIds.has(owner)) {
      const theirs = byOwner.get(owner) ?? [];
      theirs.push(one);
      byOwner.set(owner, theirs);
    }
  }
  for (const venture of running) {
    const months = owedByMonth(
      { ...costs, charges: byOwner.get(venture.id) ?? [] },
      ownedThenBy,
      venture.id,
      monthsFromTo(farmDayOf(venture.createdAt).slice(0, 7), today.slice(0, 7)),
      repaid.filter((one) => one.ventureId === venture.id)
    );
    owed.set(
      venture.id,
      roundMoney(months.reduce((sum, one) => sum + one.stillOwedMoney, 0))
    );
  }
  return owed;
};

/** One telling waiting to be made: which Venture owes which month, how much, and the id it is filed under. */
export interface ReimbursementDue {
  venture: { id: string; name: string };
  month: string;
  owedMoney: number;
  noticeId: string;
}

/**
 * The months a running Venture was found owing nothing, by the farm day they were asked on. A month that came to
 * nothing has no notice to stop the sweep asking, and the sweep runs at every opening of the staff's page: asked once a
 * farm day, a cost dated into it that arrives late is still told, the next day. Kept by the process, which the farm
 * runs on one of; a restart asks again.
 */
const foundOwingNothing = new Map<string, string>();

/**
 * The running Ventures that owe the Farm the month just over and have not been told so: not repaid, coming to more
 * than nothing — its own figure and what it carries — and no Settlement approved.
 *
 * Asked before any transaction, as the paper sweep asks its own, and in that order: what has been told or repaid is
 * read first, and the farm's costing — the dear part — is worked out only for a Venture that might still be due, so
 * the sweep every opening of the app runs costs nothing once the month's tellings are made.
 */
export const reimbursementsToTell = async (
  db: Reader,
  farmId: string,
  now: Date
): Promise<ReimbursementDue[]> => {
  const month = monthBefore(farmDayOf(now));
  const running = await db.query.venture.findMany({
    where: { farmId, state: { in: [...RUNNING] } },
    columns: { id: true, name: true },
  });
  if (running.length === 0) {
    return [];
  }
  const ids = running.map((one) => one.id);
  // As `tell` will tell it: an Owner who has left is not counted as never told.
  const owners = await whoHears(db, farmId, "reimbursement_due", { id: "" });
  if (owners.length === 0) {
    return [];
  }
  const [settled, repaid, already] = await Promise.all([
    db.query.ventureSettlement.findMany({
      where: { farmId, ventureId: { in: ids } },
      columns: { ventureId: true },
    }),
    db.query.ventureMovement.findMany({
      where: {
        farmId,
        ventureId: { in: ids },
        kind: "reimbursement",
        forMonth: month,
      },
      columns: { ventureId: true },
    }),
    db.query.alert.findMany({
      where: {
        farmId,
        kind: "reimbursement_due",
        entityId: { in: ids.map((id) => `${id}:${month}`) },
      },
      columns: { entityId: true, userId: true },
    }),
  ]);
  const settledOrRepaid = new Set(
    [...settled, ...repaid].map((one) => one.ventureId)
  );
  const told = new Set(already.map((one) => `${one.userId}|${one.entityId}`));
  const today = farmDayOf(now);
  const asking = running.filter(
    (one) =>
      !settledOrRepaid.has(one.id) &&
      foundOwingNothing.get(`${farmId}|${one.id}:${month}`) !== today &&
      owners.some((userId) => !told.has(`${userId}|${one.id}:${month}`))
  );
  if (asking.length === 0) {
    return [];
  }
  const [costs, ownedThenBy] = await Promise.all([
    farmCosts(db as Tx, farmId),
    ownedThenByOf(db as Tx, farmId),
  ]);
  const due: ReimbursementDue[] = [];
  for (const venture of asking) {
    // oxlint-disable-next-line no-await-in-loop -- one Venture at a time, on the one costing worked out above
    const figure = await aMonthsReimbursement(db, farmId, venture.id, month, {
      costs,
      ownedThenBy,
    });
    if (figure.totalMoney > 0) {
      due.push({
        venture,
        month,
        owedMoney: figure.totalMoney,
        noticeId: `${venture.id}:${month}`,
      });
    } else {
      foundOwingNothing.set(`${farmId}|${venture.id}:${month}`, today);
    }
  }
  return due;
};

/** Raises the tellings `reimbursementsToTell` found. The unique index behind `tell` is what actually stops two
 *  sweeps racing into two notices about one month. */
export const tellAboutReimbursementsDue = async (
  tx: Tx,
  farmId: string,
  due: readonly ReimbursementDue[],
  now: Date
): Promise<number> => {
  let raised = 0;
  for (const one of due) {
    // oxlint-disable-next-line no-await-in-loop -- one Venture at a time, against one unique index
    const told = await tell(
      tx,
      farmId,
      {
        kind: "reimbursement_due",
        about: { id: one.noticeId },
        facts: {
          ventureId: one.venture.id,
          venture: one.venture.name,
          month: one.month,
          owedMoney: one.owedMoney,
        },
      },
      now
    );
    raised += told.length > 0 ? 1 : 0;
  }
  return raised;
};

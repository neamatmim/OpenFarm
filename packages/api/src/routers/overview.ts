import {
  isEscalated,
  isFinished,
  litresTo,
  minutesOverdue,
  roundLitres,
  underMilkWithdrawal,
  farmDayOf,
  farmDaysApart,
} from "@OpenFarm/domain";

import { farmAccountsOut } from "../farm-account-store";
import { protectedProcedure } from "../index";
import {
  alertParams,
  daysWork,
  farmDayRange,
  findLate,
  heldByWithdrawal,
  openReviews,
  penLabel,
  workAwaitingSignOff,
} from "../instances-store";
import { lostInAYear, missingNow } from "../missing-store";
import { awaitingApproval } from "../money-store";
import { monthlyCostsNow } from "../monthly-costs-store";
import { overdueReceivable } from "../receivable-store";
import { renewalDue } from "../registration-store";
import { withTheirWork } from "../review-store";
import { requireRole } from "../roles";
import { contentOf } from "../sop-content";
import { runningLow, storeCountLate } from "../stock-store";
import { DAY_MS, LATE_SINCE_DAYS, QUEUE_LIMIT } from "./home";

/** How many milkings the Owner's tile shows beside today's: a week of them, which is what
 *  a farm reads a day against. */
const SESSIONS_ON_THE_TILE = 7;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** How far back the Owner's tile counts the farm's losses. A month is what a farm judges a
 *  mortality rate over, and it is the Owner's number rather than a list of late work. */
export const MORTALITY_DAYS = 30;

/** The Owner's start page, «How the farm stands»: everything about the farm that waits for the Owner today. */
export const overviewRouter = {
  /**
   * The Owner opens the app to an exception list: everything that needs them, and nothing
   * else. An empty list means the farm is fine, and that is the point of it — a screen that
   * always has something on it is a screen that stops meaning anything.
   *
   * Below it, the figures the farm is judged by. Every one is derived from what was
   * recorded: nobody types a number onto this screen, and nobody can.
   */
  get: protectedProcedure
    .use(requireRole("owner"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const farmId = context.farm.id;
      const { from, to } = farmDayRange(now);

      const [
        late,
        proposals,
        review,
        held,
        today,
        mortalities,
        approvals,
        week,
        lowStock,
        moneyAwaiting,
        moneyAwaitingAll,
        monthlyCosts,
        receivableOverdue,
        missing,
        storeCount,
        lostYear,
        accountsOut,
      ] = await Promise.all([
        findLate(
          context.db,
          farmId,
          now,
          new Date(now.getTime() - LATE_SINCE_DAYS * DAY_MS)
        ),
        context.db.query.sopProposal.findMany({
          where: { farmId, status: "pending" },
          columns: { id: true, definitionId: true, note: true },
          orderBy: { createdAt: "asc" },
          limit: QUEUE_LIMIT,
        }),
        openReviews(context.db, farmId, QUEUE_LIMIT),
        heldByWithdrawal(context.db, farmId, now),
        daysWork(context.db, farmId, now),
        // What the farm has lost lately. The register an inspector reads is increment 7's; the
        // number a farm lives by is this one, and it belongs where the Owner's other numbers
        // are rather than nowhere until then.
        context.db.query.mortality.findMany({
          where: {
            farmId,
            happenedAt: {
              gte: new Date(now.getTime() - MORTALITY_DAYS * DAY_MS),
            },
          },
          columns: { id: true, kind: true },
        }),
        // Work waiting on the Owner's own word. Money Events join this row in increment 6;
        // today the only thing anybody waits on an Owner to approve is work whose Version
        // named the Owner as its checker.
        workAwaitingSignOff(context.db, farmId, context.roles, QUEUE_LIMIT),
        // Every Milking Session of the week behind today — all of them, not the newest
        // seven rows: a Session belongs to one Pen, so a farm with four pens milking twice
        // raises eight a day, and seven rows would be this morning rather than the week.
        //
        // Bounded at both ends. A phone whose clock is days ahead can record a Session dated
        // in the future (ADR 0002 keeps the entry and flags the skew), and an unbounded window
        // would make that tomorrow the last bar on the tile — so the farm would be shown
        // tomorrow's half-empty figure as today's.
        context.db.query.milkingSession.findMany({
          where: {
            farmId,
            dueAt: { gte: new Date(from.getTime() - WEEK_MS), lt: to },
          },
          columns: { id: true, dueAt: true },
          orderBy: { dueAt: "desc" },
          with: {
            records: { columns: { litres: true, destination: true } },
          },
        }),
        // Feed running low, which the Owner's exception list names too (spec: "low stock").
        runningLow(context.db, context.farm, now),
        // Money the Owner has to approve, oldest first: the longer it has waited, the longer somebody
        // has been paid, or not, without the Owner's say.
        context.db.query.moneyEvent.findMany({
          // Every purse, and this one on purpose. The Purse keeps a Venture's money out of what the Farm
          // counts as its income and its cost — but money waiting for the Owner is not a figure, it is
          // work. A Venture's Intake over the Approval Threshold waits for her exactly as the Farm's
          // does, and a queue that hid it would leave it waiting for nobody. The row says whose it is.
          where: { farmId, approval: "awaiting" },
          with: {
            category: { columns: { nameBn: true, nameEn: true } },
            counterparty: { columns: { name: true } },
            purse: { columns: { name: true } },
            recorder: { columns: { name: true } },
          },
          orderBy: { recordedAt: "asc", id: "asc" },
          limit: QUEUE_LIMIT,
        }),
        // All of it counted and totalled, however many the list above shows.
        awaitingApproval(context.db, farmId),
        // The rent, the electricity and the wages the month has nothing entered for yet: a month missing is otherwise read as
        // a cheaper month.
        monthlyCostsNow(context.db, context.farm, now),
        // Buyers whose Receivable has gone past its day, and whether any was sold to on credit again while late.
        overdueReceivable(context.db, context.farm, farmDayOf(now)),
        // Animals the round could not find: the Owner hears of each at once, and sees them here until found.
        missingNow(context.db, farmId),
        // The store not counted for more than a week: the count is the one check on the Manager's feed.
        storeCountLate(context.db, farmId, now),
        // Animals written off as Lost in the year, and what they had cost: beside the deaths, as the farm's losses.
        lostInAYear(context.db, farmId, now),
        // The Farm's mobile money numbers and bank accounts with a month their statement did not agree with, or one the farm
        // has since changed its mind about.
        farmAccountsOut(context.db, farmId, now),
      ]);

      // A day of the farm's milk is every Pen's Sessions on that day added together, which
      // is what somebody means by "yesterday's milk".
      const byDay = new Map<string, { bulk: number; discard: number }>();
      for (const session of week) {
        const day = farmDayOf(session.dueAt);
        const tally = byDay.get(day) ?? { bulk: 0, discard: 0 };
        tally.bulk = roundLitres(
          tally.bulk + litresTo("bulk", session.records)
        );
        tally.discard = roundLitres(
          tally.discard + litresTo("discard", session.records)
        );
        byDay.set(day, tally);
      }
      const everyDay = [...byDay].toSorted(([a], [b]) => a.localeCompare(b));
      const days = everyDay.slice(-SESSIONS_ON_THE_TILE);
      const todaysMilk = byDay.get(farmDayOf(now)) ?? { bulk: 0, discard: 0 };
      // What today is read against is the week of days that are over: today's own half morning in the mean would pull
      // it down every morning, and read today against a figure made partly of itself.
      const over = everyDay
        .filter(([day]) => day !== farmDayOf(now))
        .slice(-SESSIONS_ON_THE_TILE);
      const average =
        over.length === 0
          ? 0
          : roundLitres(
              over.reduce((total, [, tally]) => total + tally.bulk, 0) /
                over.length
            );

      return {
        needsYou: {
          farmAccountsOut: accountsOut,
          overdue: late
            .map((instance) => ({
              id: instance.id,
              minutesOverdue: minutesOverdue(instance, now),
              escalated: isEscalated(
                instance,
                context.farm.escalationMinutes,
                now
              ),
              ...alertParams(instance),
            }))
            .toSorted((a, b) => b.minutesOverdue - a.minutesOverdue)
            .slice(0, QUEUE_LIMIT),
          approvals: approvals.map((instance) => ({
            id: instance.id,
            sopBn: contentOf(instance.version).name.bn,
            pen: penLabel(instance.pen),
            completedAt: instance.completedAt,
          })),
          proposals,
          // Each with the work it came from, looked up for exactly these rows.
          needsReview: await withTheirWork(context.db, farmId, review),
          lowStock,
          endingWithdrawal: held
            .filter(
              (beast) =>
                beast.milkWithdrawalUntil !== null &&
                beast.milkWithdrawalUntil.getTime() - now.getTime() <= DAY_MS
            )
            .map((beast) => ({
              id: beast.id,
              tagNumber: beast.tagNumber,
              until: beast.milkWithdrawalUntil,
            })),
          moneyAwaiting: moneyAwaiting.map((row) => ({
            id: row.id,
            // A Money Event, whose column is still `numeric` and so still arrives as a string.
            amountMoney: row.amountMoney,
            direction: row.direction,
            categoryBn: row.category.nameBn,
            categoryEn: row.category.nameEn,
            counterpartyName: row.counterparty?.name ?? null,
            source: row.source,
            occurredAt: row.occurredAt,
            /** Whose money is waiting, where it is not the Farm's. */
            purseName: row.purse?.name ?? null,
            /** Who entered it: the Owner asks them about it. */
            recordedByName: row.recorder?.name ?? null,
            /** Under the line alone, and waiting because the week's other pieces to the same person take it past. */
            inPieces:
              Number(row.amountMoney) <= context.farm.approvalThresholdMoney,
          })),
          /** All the money waiting for her word, counted and totalled, where the list above shows the oldest few. */
          moneyAwaitingAll,
          monthlyCosts,
          receivableOverdue: receivableOverdue.slice(0, QUEUE_LIMIT),
          /** Animals the round could not find, until the Manager marks them Found — each asked about once she has been
           *  missing as long as the Owner said: whether to write her off as Lost. */
          missing: missing.slice(0, QUEUE_LIMIT).map((one) => {
            const missingFor = farmDaysApart(
              farmDayOf(one.since),
              farmDayOf(now)
            );
            return {
              ...one,
              days: missingFor,
              askWriteOff: missingFor >= context.farm.missingWriteOffDays,
            };
          }),
          /** The store not counted for more than a week and a day; nothing while the counts are being made. */
          storeCount,
          /** The Registration coming up for renewal, or run out, and the work raised for it. */
          registrationRenewal: await renewalDue(context.db, context.farm, now),
        },
        tiles: {
          bulkToday: todaysMilk.bulk,
          discardToday: todaysMilk.discard,
          /** What the farm has been sending to the tank, a day at a time, oldest first —
           *  and what that came to on an average day of the week before today, which is what today is read against. */
          days: days.map(([day, tally]) => ({ day, litres: tally.bulk })),
          averageBulk: average,
          workDone: today.filter((instance) => isFinished(instance.state))
            .length,
          workRaised: today.length,
          underWithdrawal: held.filter((beast) =>
            underMilkWithdrawal(beast, now)
          ).length,
          /** What the farm has lost in the last thirty days, and how. */
          died: mortalities.filter((row) => row.kind === "died").length,
          culled: mortalities.filter((row) => row.kind === "culled").length,
          /** Written off as Lost in the last year, and what they had cost the farm. */
          lostYear,
        },
      };
    }),
};

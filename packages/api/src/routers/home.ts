import type { SopContent } from "@OpenFarm/domain";
import {
  AWAITING_SIGN_OFF,
  isEscalated,
  litresTo,
  minutesOverdue,
  roundLitres,
  underMeatWithdrawal,
  underMilkWithdrawal,
} from "@OpenFarm/domain";

import { repeatBreedersOn } from "../breeding-store";
import { protectedProcedure } from "../index";
import {
  alertParams,
  daysWork,
  farmDayOf,
  farmDayRange,
  findLate,
  heldByWithdrawal,
  isFinished,
  isOnTheFarm,
  openReviews,
} from "../instances-store";
import { requireRole } from "../roles";

/** Enough of each queue to work from. A Manager with more than this waiting has a problem
 *  the list is not going to solve. */
const QUEUE_LIMIT = 50;

/** How far back the day's late work is worth listing. Older than this and it is not a queue
 *  any more; it is a conversation the farm needs to have about the month. */
const LATE_SINCE_DAYS = 30;
/** How far back the Owner's tile counts the farm's losses. A month is what a farm judges a
 *  mortality rate over, and it is the Owner's number rather than a list of late work. */
export const MORTALITY_DAYS = 30;

/** How many milkings the Owner's tile shows beside today's: a week of them, which is what
 *  a farm reads a day against. */
const SESSIONS_ON_THE_TILE = 7;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const contentOf = (version: { content: unknown }): SopContent =>
  version.content as SopContent;

export const homeRouter = {
  /**
   * The one screen the Manager runs the day from: what needs them, and how the day is going
   * pen by pen.
   *
   * Every number here is a list somebody can open. A count with no way to reach what it
   * counts is a number people stop believing, and a home screen full of those is a home
   * screen nobody opens.
   */
  manager: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const farmId = context.farm.id;

      const [
        late,
        awaitingSignOff,
        review,
        completions,
        animals,
        herd,
        today,
        repeatBreeders,
      ] = await Promise.all([
        findLate(
          context.db,
          farmId,
          now,
          new Date(now.getTime() - LATE_SINCE_DAYS * DAY_MS)
        ),
        context.db.query.sopInstance.findMany({
          where: {
            farmId,
            state: AWAITING_SIGN_OFF,
            checkerRole: { in: context.roles },
          },
          with: {
            version: { columns: { content: true } },
            pen: {
              columns: { name: true },
              with: { shed: { columns: { name: true } } },
            },
          },
          orderBy: { completedAt: "asc" },
          limit: QUEUE_LIMIT,
        }),
        openReviews(context.db, farmId, QUEUE_LIMIT),
        // The work each of those entries belongs to, so the row reaches it rather than
        // dropping somebody on a list to search.
        context.db.query.stepCompletion.findMany({
          where: { farmId },
          columns: { id: true, instanceId: true },
          orderBy: { receivedAt: "desc" },
          limit: QUEUE_LIMIT * 4,
        }),
        heldByWithdrawal(context.db, farmId, now),
        // The animals standing in each Pen, for the line that says how big the job is.
        context.db.query.animal.findMany({
          where: { farmId },
          columns: { penId: true, state: true },
        }),
        // The day's work, asked the one way it is asked everywhere, so the Manager's
        // screen and the milker's cannot disagree about what was raised.
        daysWork(context.db, farmId, now),
        // Cows somebody has to decide about. Listed and never pushed: a cull-or-treat decision
        // waits for somebody sitting down with it (the Owner, 2026-09-13).
        repeatBreedersOn(
          context.db,
          farmId,
          context.farm.repeatBreederThreshold
        ),
      ]);

      const underWithdrawal = animals;
      const pens = new Map<
        string,
        { raised: number; done: number; missed: number }
      >();
      for (const instance of today) {
        const tally = pens.get(instance.penId) ?? {
          raised: 0,
          done: 0,
          missed: 0,
        };
        tally.raised += 1;
        if (isFinished(instance.state)) {
          tally.done += 1;
        }
        // Missed is settled, not outstanding: the Manager closed it with a reason. A Pen
        // left reading "one of two" all day, with nothing to tap, is the screen telling
        // somebody about a decision they already made.
        if (instance.state === "missed") {
          tally.missed += 1;
        }
        pens.set(instance.penId, tally);
      }
      const animalsByPen = new Map<string, number>();
      for (const standing of herd.filter((one) => isOnTheFarm(one))) {
        animalsByPen.set(
          standing.penId,
          (animalsByPen.get(standing.penId) ?? 0) + 1
        );
      }

      const doneToday = today.filter((instance) =>
        isFinished(instance.state)
      ).length;
      return {
        /** The two figures a Manager judges a day by: how much of it is done, and how many
         *  animals the farm is not allowed to sell the milk of. */
        tiles: {
          workDone: doneToday,
          workRaised: today.length,
          // The tile says "milk the farm may not sell", so it counts the cows that is true
          // of. A cow held back only from sale is held, but not from the tank.
          underWithdrawal: underWithdrawal.filter((beast) =>
            underMilkWithdrawal(beast, now)
          ).length,
        },
        queue: {
          repeatBreeders: repeatBreeders.slice(0, QUEUE_LIMIT),
          // Latest first and bounded, the way the Overdue screen itself reads: a Manager
          // opening this in a shed is handed the work that has waited longest, not a year
          // of it in whatever order the database found it.
          overdue: late
            .map((instance) => ({
              id: instance.id,
              penId: instance.penId,
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
          signOff: awaitingSignOff.map((instance) => ({
            id: instance.id,
            penId: instance.penId,
            sopBn: contentOf(instance.version).name.bn,
            pen: `${instance.pen.shed.name} / ${instance.pen.name}`,
            // When it was finished, which is how long it has been waiting for them — not
            // when it fell due, which is the Alert's question rather than this queue's.
            completedAt: instance.completedAt,
          })),
          needsReview: review.map((row) => ({
            ...row,
            instanceId:
              completions.find((one) => one.id === row.entityId)?.instanceId ??
              null,
          })),
          /** Cows whose milk may not go to the tank today, soonest to come off first: a
           *  Withdrawal ending is the one a Manager has to plan around. */
          withdrawal: underWithdrawal
            .filter((beast) => underMilkWithdrawal(beast, now))
            // Soonest to come off first: a Withdrawal ending is the one a Manager has to plan
            // around, and it was this read that used to do the sorting.
            .toSorted(
              (a, b) =>
                (a.milkWithdrawalUntil?.getTime() ?? 0) -
                (b.milkWithdrawalUntil?.getTime() ?? 0)
            )
            .map((beast) => ({
              id: beast.id,
              tagNumber: beast.tagNumber,
              until: beast.milkWithdrawalUntil,
              /** Off withdrawal within the day: what the notification table calls
               *  "withdrawal ending tomorrow", which Health will also Alert on (increment
               *  3, when a Treatment is what sets the date). */
              endingSoon:
                beast.milkWithdrawalUntil !== null &&
                beast.milkWithdrawalUntil.getTime() - now.getTime() <= DAY_MS,
            })),
          /** Cows who must not be sold yet, and the day each is fit for sale again. The Sale
           *  SOP arrives in increment 4 and reads the same date; until then this is what
           *  stops a Manager selling a cow who is still carrying a drug. */
          meatWithdrawal: underWithdrawal
            .filter((beast) => underMeatWithdrawal(beast, now))
            // Soonest fit for sale first: this list is read to plan, and the cow closest to
            // being sellable is the one the plan turns on.
            .toSorted(
              (a, b) =>
                (a.meatWithdrawalUntil?.getTime() ?? 0) -
                (b.meatWithdrawalUntil?.getTime() ?? 0)
            )
            .map((beast) => ({
              id: beast.id,
              tagNumber: beast.tagNumber,
              fitForSaleAt: beast.meatWithdrawalUntil,
            })),
        },
        pens: [...pens].map(([penId, tally]) => ({
          penId,
          ...tally,
          animals: animalsByPen.get(penId) ?? 0,
        })),
      };
    }),

  /**
   * The Owner opens the app to an exception list: everything that needs them, and nothing
   * else. An empty list means the farm is fine, and that is the point of it — a screen that
   * always has something on it is a screen that stops meaning anything.
   *
   * Below it, the figures the farm is judged by. Every one is derived from what was
   * recorded: nobody types a number onto this screen, and nobody can.
   */
  owner: protectedProcedure
    .use(requireRole("owner"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const farmId = context.farm.id;
      const { from, to } = farmDayRange(now);

      const [
        late,
        proposals,
        review,
        completions,
        held,
        today,
        mortalities,
        approvals,
        week,
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
        context.db.query.stepCompletion.findMany({
          where: { farmId },
          columns: { id: true, instanceId: true },
          orderBy: { receivedAt: "desc" },
          limit: QUEUE_LIMIT * 4,
        }),
        heldByWithdrawal(context.db, farmId, now),
        daysWork(context.db, farmId, now),
        // What the farm has lost lately. The register an inspector reads is increment 7's; the
        // number a farm lives by is this one, and it belongs where the Owner's other numbers
        // are rather than nowhere until then.
        context.db.query.mortality.findMany({
          where: {
            farmId,
            happenedAt: {
              gte: new Date(now.getTime() - LATE_SINCE_DAYS * DAY_MS),
            },
          },
          columns: { id: true, kind: true },
        }),
        // Work waiting on the Owner's own word. Money Events join this row in increment 6;
        // today the only thing anybody waits on an Owner to approve is work whose Version
        // named the Owner as its checker.
        context.db.query.sopInstance.findMany({
          where: {
            farmId,
            state: AWAITING_SIGN_OFF,
            checkerRole: { in: context.roles },
          },
          with: {
            version: { columns: { content: true } },
            pen: {
              columns: { name: true },
              with: { shed: { columns: { name: true } } },
            },
          },
          orderBy: { completedAt: "asc" },
          limit: QUEUE_LIMIT,
        }),
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
      const days = [...byDay]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .slice(-SESSIONS_ON_THE_TILE);
      const todaysMilk = byDay.get(farmDayOf(now)) ?? { bulk: 0, discard: 0 };
      const average =
        days.length === 0
          ? 0
          : roundLitres(
              days.reduce((total, [, tally]) => total + tally.bulk, 0) /
                days.length
            );

      return {
        needsYou: {
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
            pen: `${instance.pen.shed.name} / ${instance.pen.name}`,
            completedAt: instance.completedAt,
          })),
          proposals,
          needsReview: review.map((row) => ({
            ...row,
            instanceId:
              completions.find((one) => one.id === row.entityId)?.instanceId ??
              null,
          })),
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
          /** Money Events awaiting approval arrive with Finance in increment 6, low stock
           *  with Feed stock in the same one, and the DLS renewal in increment 7. A row
           *  faked now would be a row the Owner learns to distrust. */
        },
        tiles: {
          bulkToday: todaysMilk.bulk,
          discardToday: todaysMilk.discard,
          /** What the farm has been sending to the tank, a day at a time, oldest first —
           *  and what that comes to on an average day, which is what today is read against. */
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
        },
      };
    }),
};

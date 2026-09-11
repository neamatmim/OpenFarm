import type { SopContent } from "@OpenFarm/domain";
import {
  AWAITING_SIGN_OFF,
  isEscalated,
  minutesOverdue,
  underMilkWithdrawal,
} from "@OpenFarm/domain";

import { protectedProcedure } from "../index";
import {
  alertParams,
  farmDayRange,
  findLate,
  isOnTheFarm,
} from "../instances-store";
import { requireRole } from "../roles";

/** Enough of each queue to work from. A Manager with more than this waiting has a problem
 *  the list is not going to solve. */
const QUEUE_LIMIT = 50;

/** How far back the day's late work is worth listing. Older than this and it is not a queue
 *  any more; it is a conversation the farm needs to have about the month. */
const LATE_SINCE_DAYS = 30;
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
      const { from, to } = farmDayRange(now);

      const [late, awaitingSignOff, review, completions, animals, herd, today] =
        await Promise.all([
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
          context.db.query.needsReview.findMany({
            where: { farmId, resolvedAt: { isNull: true } },
            columns: { id: true, entity: true, entityId: true, reason: true },
            orderBy: { raisedAt: "asc" },
            limit: QUEUE_LIMIT,
          }),
          // The work each of those entries belongs to, so the row reaches it rather than
          // dropping somebody on a list to search.
          context.db.query.stepCompletion.findMany({
            where: { farmId },
            columns: { id: true, instanceId: true },
            orderBy: { receivedAt: "desc" },
            limit: QUEUE_LIMIT * 4,
          }),
          context.db.query.animal.findMany({
            // Only the cows the question is about: a herd of five hundred read in full to
            // find the three under Withdrawal is a page load nobody in a shed waits for.
            where: { farmId, milkWithdrawalUntil: { gt: now } },
            columns: {
              id: true,
              tagNumber: true,
              state: true,
              penId: true,
              milkWithdrawalUntil: true,
            },
          }),
          // The animals standing in each Pen, for the line that says how big the job is.
          context.db.query.animal.findMany({
            where: { farmId },
            columns: { penId: true, state: true },
          }),
          // The day's work, from the same shape the Today screen reads: one way of asking,
          // so the Manager's screen and the milker's cannot disagree about what was raised.
          context.db.query.sopInstance.findMany({
            where: { farmId, dueAt: { gte: from, lt: to } },
            columns: { id: true, penId: true, state: true },
          }),
        ]);

      const underWithdrawal = animals.filter((beast) => isOnTheFarm(beast));
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
        if (instance.state === "completed" || instance.state === "approved") {
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

      const doneToday = today.filter(
        (instance) =>
          instance.state === "completed" || instance.state === "approved"
      ).length;
      return {
        /** The two figures a Manager judges a day by: how much of it is done, and how many
         *  animals the farm is not allowed to sell the milk of. */
        tiles: {
          workDone: doneToday,
          workRaised: today.length,
          underWithdrawal: underWithdrawal.length,
        },
        queue: {
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
            }))
            .toSorted(
              (a, b) => (a.until?.getTime() ?? 0) - (b.until?.getTime() ?? 0)
            ),
        },
        pens: [...pens].map(([penId, tally]) => ({
          penId,
          ...tally,
          animals: animalsByPen.get(penId) ?? 0,
        })),
      };
    }),
};

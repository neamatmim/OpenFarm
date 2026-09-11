import { AWAITING_SIGN_OFF, underMilkWithdrawal } from "@OpenFarm/domain";

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

      const [late, awaitingSignOff, review, animals, today] = await Promise.all(
        [
          findLate(context.db, farmId, now),
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
          context.db.query.animal.findMany({
            where: { farmId },
            columns: {
              id: true,
              tagNumber: true,
              state: true,
              penId: true,
              milkWithdrawalUntil: true,
            },
          }),
          // The day's work, from the same query the Today screen reads: one source of truth,
          // so the Manager's screen and the milker's cannot disagree about what was raised.
          context.db.query.sopInstance.findMany({
            where: { farmId, dueAt: { gte: from, lt: to } },
            columns: { id: true, penId: true, state: true },
          }),
        ]
      );

      const herd = animals.filter((beast) => isOnTheFarm(beast));
      const pens = new Map<string, { raised: number; done: number }>();
      for (const instance of today) {
        const tally = pens.get(instance.penId) ?? { raised: 0, done: 0 };
        tally.raised += 1;
        if (instance.state === "completed" || instance.state === "approved") {
          tally.done += 1;
        }
        pens.set(instance.penId, tally);
      }
      const animalsByPen = new Map<string, number>();
      for (const beast of herd) {
        animalsByPen.set(beast.penId, (animalsByPen.get(beast.penId) ?? 0) + 1);
      }

      return {
        queue: {
          overdue: late.map((instance) => ({
            id: instance.id,
            penId: instance.penId,
            ...alertParams(instance),
          })),
          signOff: awaitingSignOff.map((instance) => ({
            id: instance.id,
            penId: instance.penId,
            ...alertParams({ ...instance, dueAt: instance.dueAt }),
          })),
          needsReview: review,
          /** Cows whose milk may not go to the tank today. */
          withdrawal: herd
            .filter((beast) => underMilkWithdrawal(beast, now))
            .map((beast) => ({
              id: beast.id,
              tagNumber: beast.tagNumber,
              until: beast.milkWithdrawalUntil,
            })),
        },
        pens: [...pens].map(([penId, tally]) => ({
          penId,
          ...tally,
          animals: animalsByPen.get(penId) ?? 0,
        })),
      };
    }),
};

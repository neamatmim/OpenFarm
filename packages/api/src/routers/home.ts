import {
  isEscalated,
  isFinished,
  minutesOverdue,
  underMeatWithdrawal,
  underMilkWithdrawal,
  farmDayOf,
} from "@OpenFarm/domain";

import { heatWatchOn, repeatBreedersOn } from "../breeding-store";
import { illAgainOn } from "../health-store";
import { protectedProcedure } from "../index";
import {
  alertParams,
  daysWork,
  findLate,
  heldByWithdrawal,
  isOnTheFarm,
  openReviews,
  penLabel,
  workAwaitingSignOff,
} from "../instances-store";
import { milkDropsOn } from "../milk-store";
import { missingNow } from "../missing-store";
import { monthlyCostsNow } from "../monthly-costs-store";
import { overdueReceivable } from "../receivable-store";
import { withTheirWork } from "../review-store";
import { requireRole } from "../roles";
import { contentOf } from "../sop-content";
import { runningLow } from "../stock-store";

/** Enough of each queue to work from. A Manager with more than this waiting has a problem
 *  the list is not going to solve. */
export const QUEUE_LIMIT = 50;

export const DAY_MS = 24 * 60 * 60 * 1000;

export const homeRouter = {
  /**
   * The one screen the Manager runs the day from: what needs them, and how the day is going
   * pen by pen.
   *
   * Every number here is a list somebody can open. A count with no way to reach what it
   * counts is a number people stop believing, and a home screen full of those is a home
   * screen nobody opens.
   */
  get: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const farmId = context.farm.id;

      const [
        late,
        awaitingSignOff,
        review,
        animals,
        herd,
        today,
        repeatBreeders,
        lowStock,
        monthlyCosts,
        receivableOverdue,
        missing,
        illAgain,
        heatWatch,
        givingLess,
      ] = await Promise.all([
        // Every piece of late work still open, as the Overdue list holds it: one a month old is still late, and a home
        // that said nothing was late while the list held it was wrong (the Owner, 2026-10-06).
        findLate(context.db, farmId, now),
        workAwaitingSignOff(context.db, farmId, context.roles, QUEUE_LIMIT),
        openReviews(context.db, farmId, QUEUE_LIMIT),
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
        // Feed running low: on the Manager's queue as well as in their digest, because a queue is
        // where somebody deciding what to buy looks.
        runningLow(context.db, context.farm, now),
        // The rent, the electricity and the wages the month has nothing entered for yet: the Manager enters the money.
        monthlyCostsNow(context.db, context.farm, now),
        // Buyers whose Receivable has gone past its day: the Manager rings them.
        overdueReceivable(context.db, context.farm, farmDayOf(now)),
        // Animals the round could not find: the Manager walks the farm for them, and marks them Found.
        missingNow(context.db, farmId),
        // Animals the Vet has diagnosed again and again: listed, never pushed, as the repeat breeders are — whether to
        // keep treating one is the Owner's to weigh (the Owner, 2026-09-29).
        illAgainOn(context.db, context.farm, now),
        // Open cows the farm expects in heat and nobody has seen: a missed heat is three weeks of milk and calf gone.
        heatWatchOn(context.db, context.farm, now),
        // Cows giving well under their own week: sudden illness shows in the pail before anywhere else.
        milkDropsOn(context.db, context.farm, now),
      ]);

      const underWithdrawal = animals;
      const pens = new Map<
        string,
        { raised: number; done: number; missed: number }
      >();
      for (const instance of today) {
        // Work about the whole farm is in no Pen, and no Pen's progress.
        if (instance.penId === null) {
          continue;
        }
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
          lowStock,
          monthlyCosts,
          receivableOverdue: receivableOverdue.slice(0, QUEUE_LIMIT),
          missing: missing.slice(0, QUEUE_LIMIT),
          illAgain: illAgain.slice(0, QUEUE_LIMIT),
          heatWatch: heatWatch.slice(0, QUEUE_LIMIT),
          givingLess: givingLess.slice(0, QUEUE_LIMIT),
          // Latest first and bounded, the way the Overdue screen itself reads: a Manager
          // opening this in a shed is handed the work that has waited longest, not a year
          // of it in whatever order the database found it.
          /** How much late work there is in all: the list below is its longest-waiting, at most `QUEUE_LIMIT`. */
          overdueTotal: late.length,
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
            pen: penLabel(instance.pen),
            // When it was finished, which is how long it has been waiting for them — not
            // when it fell due, which is the Alert's question rather than this queue's.
            completedAt: instance.completedAt,
          })),
          // Each with the work it came from, looked up for exactly these rows.
          needsReview: await withTheirWork(context.db, farmId, review),
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
};

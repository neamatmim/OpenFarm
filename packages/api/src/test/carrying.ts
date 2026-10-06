import { farmDayOf } from "@OpenFarm/domain";

const A_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A day a heifer set carrying by hand is expected to calve, a month on from the clock of whoever sets it: a State set
 * Pregnant Heifer says when she will calve, as she is registered, and a fixture that only wants her carrying on the way
 * to her first milking has no day of its own to give.
 */
export const aMonthOn = (who: { context: { clock: { now: () => Date } } }) =>
  farmDayOf(new Date(who.context.clock.now().getTime() + A_MONTH_MS));

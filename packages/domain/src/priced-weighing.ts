import { farmDayOf, farmDaysApart } from "./farm-clock";

/**
 * Whether her last weighing is too old to strike a price on, on the day the price is struck: more than `days` farm days
 * before it. An Internal Sale and the Wind-up Period's buy-back both price an animal by her weight, and a bull weighed a
 * month ago has eaten a month since — the Owner can put her on the scale tomorrow. Says the day and how old.
 */
export const weighedTooLongAgo = (
  weighedAt: Date,
  day: string,
  days: number
): { weighedOn: string; days: number } | null => {
  const weighedOn = farmDayOf(weighedAt);
  const old = farmDaysApart(weighedOn, day);
  return old > days ? { weighedOn, days: old } : null;
};

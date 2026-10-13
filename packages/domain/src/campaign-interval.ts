import { addDays } from "./fattening";
import type { SopContent } from "./sop";

/**
 * A **Campaign Interval**: the months between one Campaign's dose and the next for the same Animal. Counted per animal
 * from her last dose of the product, whichever procedure gave it — the arrival vaccine, its booster, the herd's own
 * Campaign — so a bull vaccinated on arrival last month is not due the herd's round this one.
 */

/** How long before her day an animal is said to be coming due: a fortnight, time to buy the vaccine and walk the Pen. */
export const CAMPAIGN_SOON_DAYS = 14;

/** `day` plus `months` calendar months, as "YYYY-MM-DD"; a day past the end of a shorter month is that month's last. */
export const addMonths = (day: string, months: number): string => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const counted = year * 12 + (month - 1) + months;
  const toYear = Math.floor(counted / 12);
  const toMonth = (counted % 12) + 1;
  const lastOfMonth = new Date(Date.UTC(toYear, toMonth, 0)).getUTCDate();
  const toDate = Math.min(date, lastOfMonth);
  return `${String(toYear).padStart(4, "0")}-${String(toMonth).padStart(2, "0")}-${String(toDate).padStart(2, "0")}`;
};

/** The months a procedure's Campaign comes round in, or nothing for a procedure that does not come round. */
export const campaignIntervalOf = (content: SopContent): number | null => {
  for (const trigger of content.triggers) {
    if (trigger.kind === "every_months") {
      return trigger.months;
    }
  }
  return null;
};

/** The product a Campaign gives every animal it walks — what her last dose is looked for by — or nothing. */
export const campaignProductOf = (content: SopContent): string | null => {
  for (const step of content.steps) {
    if (
      step.repeatPerAnimal &&
      step.effect?.kind === "treatment" &&
      step.effect.productId
    ) {
      return step.effect.productId;
    }
  }
  return null;
};

/**
 * The day an animal's next dose falls due: the interval after her last dose of the product, or — never given it on the
 * farm — the interval after she was first counted: the later of her coming onto the farm and the interval coming into
 * force. Not today: a farm that adopts the interval, or a herd brought onto the app vaccinated on paper, is not told the
 * whole herd is due the day it starts. The Manager raises the first Campaign when the farm knows it is owed.
 */
export const campaignDueOf = ({
  lastGivenOn,
  countedFrom,
  months,
}: {
  lastGivenOn: string | null;
  countedFrom: string;
  months: number;
}): string => addMonths(lastGivenOn ?? countedFrom, months);

/** How an animal stands for a Campaign on a day: due once her day has come, soon within the fortnight before it, and
 *  nothing further off. */
export const dueForACampaign = (
  dueOn: string,
  today: string
): "due" | "soon" | null => {
  if (dueOn <= today) {
    return "due";
  }
  return dueOn <= addDays(today, CAMPAIGN_SOON_DAYS) ? "soon" : null;
};

/**
 * The day a Pen's Campaign has been owed since: the earliest of its animals' due days that has come, or nothing while
 * none has. What the Campaign raised for it is keyed on — the same day while the same animals are owed it, so the turn
 * raises it once; a new day once they are dosed and come round again.
 */
export const penDueSince = (
  dueDays: readonly string[],
  today: string
): string | null => {
  let earliest: string | null = null;
  for (const day of dueDays) {
    if (day <= today && (earliest === null || day < earliest)) {
      earliest = day;
    }
  }
  return earliest;
};

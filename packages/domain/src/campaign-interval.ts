import { dayMoved } from "./farm-clock";
import type { SopContent, Step, Trigger } from "./sop";

/**
 * A **Campaign Interval**: the months between one Campaign's dose and the next for the same Animal. Counted per animal
 * from her last dose of the product, whichever procedure gave it — the arrival vaccine, its booster, the herd's own
 * Campaign — so a bull vaccinated on arrival last month is not due the herd's round this one.
 */

/** How long before her day an animal is said to be coming due: a fortnight, time to buy the vaccine and walk the Pen. */
export const CAMPAIGN_SOON_DAYS = 14;

/** `day` plus `months` calendar months, as "YYYY-MM-DD"; a day past the end of a shorter month is that month's last. */
export const addMonths = (day: string, months: number): string =>
  dayMoved(day, { months });

/** A procedure's Campaign Interval Trigger, read once: nothing for a procedure that does not come round. */
export const campaignIntervalTriggerOf = (
  content: Pick<SopContent, "triggers">
): Extract<Trigger, { kind: "every_months" }> | null =>
  content.triggers.find(
    (trigger): trigger is Extract<Trigger, { kind: "every_months" }> =>
      trigger.kind === "every_months"
  ) ?? null;

/** The months a procedure's Campaign comes round in, or nothing for a procedure that does not come round. */
export const campaignIntervalOf = (
  content: Pick<SopContent, "triggers">
): number | null => campaignIntervalTriggerOf(content)?.months ?? null;

/** Whether a Step is a Campaign's dose: given to every animal walked, of a product the Version names. */
export const isCampaignDose = (
  step: Pick<Step, "repeatPerAnimal" | "effect">
): boolean =>
  step.repeatPerAnimal &&
  step.effect?.kind === "treatment" &&
  Boolean(step.effect.productId);

/** The product a Campaign gives every animal it walks — what her last dose is looked for by — or nothing. */
export const campaignProductOf = (
  content: Pick<SopContent, "steps">
): string | null => {
  const dose = content.steps.find(isCampaignDose);
  return dose?.effect?.kind === "treatment"
    ? (dose.effect.productId ?? null)
    : null;
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
  return dueOn <= dayMoved(today, { days: CAMPAIGN_SOON_DAYS }) ? "soon" : null;
};

/**
 * The day a Pen's Campaign is keyed on: the latest of its animals' due days that has come, or nothing while none has.
 * The latest, not the earliest — one animal left undosed keeps her old day, and keyed on her the Pen would never come
 * round again however often the rest were dosed. Keyed on the latest, the same while the same animals are owed it, so a
 * round left Missed is not raised again until a later day comes: the rest coming round, or another animal's day.
 */
export const penDueBy = (
  dueDays: readonly string[],
  today: string
): string | null => {
  let latest: string | null = null;
  for (const day of dueDays) {
    if (day <= today && (latest === null || day > latest)) {
      latest = day;
    }
  }
  return latest;
};

/**
 * The day an animal was last dosed, where that dose still covers her — her next not yet come — so the Campaign's walk
 * says "not due — dosed then" rather than dosing her again. Nothing for an animal never given it on the farm, who is
 * walked as any other.
 */
export const notDueSince = ({
  lastGivenOn,
  months,
  today,
}: {
  lastGivenOn: string | null;
  months: number;
  today: string;
}): string | null =>
  lastGivenOn !== null && addMonths(lastGivenOn, months) > today
    ? lastGivenOn
    : null;

/** Whether an animal on this Step may be passed as not due: a Campaign's dose, which her last one may still cover. */
export const mayPassAsNotDue = (
  step: Pick<Step, "repeatPerAnimal" | "effect">
): boolean => isCampaignDose(step);

/** Whether an animal Ready for Sale may be held on this Step, her dose put off till she is back to Fattening: a dose given
 *  one animal at a time — a Campaign's, or one of his arrival doses — whose withdrawal would hold up the sale. Never a
 *  Prescription's: her course is the Vet's to stop. */
export const mayHoldForSale = (
  step: Pick<Step, "repeatPerAnimal" | "effect">
): boolean => isCampaignDose(step);

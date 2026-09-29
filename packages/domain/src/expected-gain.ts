import { farmDayOf, farmDaysApart, startOfFarmDay } from "./farm-clock";
import type { WeighIn } from "./fattening";
import { PLAUSIBLE_DAILY_GAIN_KG, addDays } from "./fattening";

/**
 * A Ration's Expected Gain: the kilos a day, low to high, it is written to put on the animals that eat it. A range and
 * never one figure, because the published trials a figure comes from never agree on one (docs/research/
 * expected-daily-gain.md), and a bull a few grams under a single figure is not a bull anybody should go and look at.
 */
export interface ExpectedGain {
  lowKg: number;
  highKg: number;
}

/** What is wrong with an Expected Gain as typed: a gain of nothing or less, one no bull makes, or a low above its high. */
export const findExpectedGainProblems = ({
  lowKg,
  highKg,
}: ExpectedGain): string[] => {
  const problems: string[] = [];
  for (const [field, value] of [
    ["lowKg", lowKg],
    ["highKg", highKg],
  ] as const) {
    if (!(Number.isFinite(value) && value > 0)) {
      problems.push(`expectedGain.${field}: a gain above nothing`);
    } else if (value > PLAUSIBLE_DAILY_GAIN_KG) {
      problems.push(
        `expectedGain.${field}: more than ${PLAUSIBLE_DAILY_GAIN_KG} kg a day, which no bull gains`
      );
    }
  }
  if (lowKg > highKg) {
    problems.push("expectedGain: Low must not be above High");
  }
  return problems;
};

/**
 * How long a bought-in bull takes to settle after he arrives, before what he gains says anything about his Ration. He
 * comes off a lorry and a haat having lost gut fill, and makes it back in his first days; and he is stepped up to
 * grain over three weeks at least (Merck), eating the arrival Ration meanwhile. Not a Farm Parameter: it is a fact
 * about cattle, not about this farm (docs/research/expected-daily-gain.md).
 */
export const SETTLING_IN_DAYS = 21;

/**
 * The first farm day a reading may be that her gain on her Ration is counted from: once she has settled in after she
 * came, for an animal the farm bought, and the day she began standing on this Ration — moved into a Pen on it, or her
 * Pen put on it — so a bull is never judged by what he gained on the Ration before. Counted in the farm's days, not
 * hours: a bull that came at ten and was weighed at eight three weeks on has settled in.
 */
export const gainCountsFrom = ({
  arrivedAt,
  onRationSince,
}: {
  /** When she came off the lorry, for an animal the farm bought; null for one born here or walked across. */
  arrivedAt: Date | null;
  onRationSince: Date;
}): Date => {
  const onRation = farmDayOf(onRationSince);
  if (arrivedAt === null) {
    return startOfFarmDay(onRation);
  }
  const settled = addDays(farmDayOf(arrivedAt), SETTLING_IN_DAYS);
  return startOfFarmDay(settled > onRation ? settled : onRation);
};

/** A gain the scale can vouch for: the two readings it runs between, and what it comes to a day. */
export interface GainOnRation {
  /** Kilogrammes a day, to the hundredth, as the board shows a rate. Negative when she is losing. */
  dailyGainKg: number;
  /** Farm days between the two readings, which the rate is over. */
  overDays: number;
  from: WeighIn;
  to: WeighIn;
}

/** Rates carry a decimal more than kilogrammes do, as the board's do. */
const RATE_SCALE = 100;

/**
 * Her gain on the Ration she is eating: from her latest reading back to the latest one at least `readDays` farm days
 * before it, and no earlier than `countsFrom`. A full gut moves a bull by five kilos from one morning to the next, which
 * over a fortnight reads as a third of a kilo a day either way, so nearer readings are passed over. Nothing while no
 * reading is both far enough back and late enough — which is the answer, not a gap: she has not been on it long enough
 * to say.
 */
export const gainOnRationOf = (
  /** The readings the farm did not doubt, in any order. */
  readings: readonly WeighIn[],
  { readDays, countsFrom }: { readDays: number; countsFrom: Date }
): GainOnRation | null => {
  const counted = readings
    .filter((one) => one.weighedAt >= countsFrom)
    .toSorted((a, b) => a.weighedAt.getTime() - b.weighedAt.getTime());
  const to = counted.at(-1);
  if (!to) {
    return null;
  }
  const daysBefore = (one: WeighIn) =>
    farmDaysApart(farmDayOf(one.weighedAt), farmDayOf(to.weighedAt));
  // Never fewer than a day, whatever the farm asks: a rate over no days is no rate.
  const fewestDays = Math.max(readDays, 1);
  const from = counted.findLast((one) => daysBefore(one) >= fewestDays);
  if (!from) {
    return null;
  }
  const overDays = daysBefore(from);
  return {
    dailyGainKg:
      Math.round(((to.weightKg - from.weightKg) / overDays) * RATE_SCALE) /
      RATE_SCALE,
    overDays,
    from,
    to,
  };
};

/** Where her gain stands against her Ration's Expected Gain: losing weight, under it, within it, or over it. */
export const GAIN_STANDINGS = ["losing", "under", "within", "over"] as const;
export type GainStanding = (typeof GAIN_STANDINGS)[number];

/**
 * Her gain against her Ration's Expected Gain, judged on the figure as the farm is shown it — a bull whose gain reads
 * as the low end is within it, whatever the thousandths were. Losing is said apart from under, because a bull going
 * backwards is ill or not eating, which is a different visit from a bull merely slow.
 */
export const gainStandingOf = (
  dailyGainKg: number,
  { lowKg, highKg }: ExpectedGain
): GainStanding => {
  if (dailyGainKg < 0) {
    return "losing";
  }
  if (dailyGainKg < lowKg) {
    return "under";
  }
  return dailyGainKg > highKg ? "over" : "within";
};

/** Whether a standing is one the farm is told of: a bull gaining under what his Ration should give him, or losing. */
export const isShortOfExpected = (standing: GainStanding): boolean =>
  standing === "losing" || standing === "under";

import { farmDayOf, farmDaysApart, startOfFarmDay } from "./farm-clock";
import type { WeighIn } from "./fattening";
import {
  PLAUSIBLE_DAILY_GAIN_KG,
  addDays,
  readingFarEnoughBack,
} from "./fattening";
import type { WeightBand } from "./feed";
import { bandStanding, roundKg } from "./feed";

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
 * comes off a lorry and a livestock market having lost gut fill, and makes it back in his first days; and he is stepped up to
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

/** A share said as a percentage is out of this. */
const PERCENT = 100;

/**
 * Her gain on the Ration she is eating: from her latest reading back to the latest one at least `readDays` farm days
 * before it (`readingFarEnoughBack`), and no earlier than `countsFrom`. Nothing while no reading is both far enough back
 * and late enough — which is the answer, not a gap: she has not been on it long enough to say.
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
  const from = readingFarEnoughBack(counted, to, readDays);
  if (!from) {
    return null;
  }
  const overDays = farmDaysApart(
    farmDayOf(from.weighedAt),
    farmDayOf(to.weighedAt)
  );
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

/** The shares of a Ration's Expected Gain the farm judges a deshi animal and a female against, as percentages: Farm
 *  Parameters, seven tenths and eight tenths unless the Manager says otherwise. */
export interface GainShares {
  deshiPercent: number;
  femalePercent: number;
}

/** What her own range was worked from: the share it was cut to for her Breed — its own, or the deshi share — or for
 *  being female, and whether anybody wrote down her breed — one nobody did is judged as a cross, as the Ration's
 *  figures are written for. */
export interface GainAdjustment {
  /** Her Breed's own share, when the farm has set one for it; it stands in for the deshi share. */
  breedPercent: number | null;
  /** The deshi share, when she is deshi and her Breed has no share of its own; null otherwise, or when nobody knows. */
  deshiPercent: number | null;
  /** The female share, when she is a cow or heifer; null for a bull. */
  femalePercent: number | null;
  breedRecorded: boolean;
}

/** The least and the most a Breed's own share may be: as low as the deshi and female shares go, and up to a fifth over
 *  the Ration as written — a Breed whose bulls beat the Ration may say so; past that, the Ration is what is wrong. */
export const BREED_GAIN_PERCENT = { least: 30, most: 120 } as const;

/** The share a Breed takes from the farm's own figure with one press: its middle, to the whole percent, held inside the
 *  bounds — a Breed whose bulls beat the Ration by more than a fifth is offered the fifth. */
export const shareToUse = (figure: { medianPercent: number }): number =>
  Math.min(
    BREED_GAIN_PERCENT.most,
    Math.max(BREED_GAIN_PERCENT.least, Math.round(figure.medianPercent))
  );

/** Whether a figure may be a Breed's own share: a whole percent inside the bounds. */
export const isBreedGainPercent = (percent: number): boolean =>
  Number.isInteger(percent) &&
  percent >= BREED_GAIN_PERCENT.least &&
  percent <= BREED_GAIN_PERCENT.most;

/** What an animal's range is cut for: her Breed — deshi or not, and its own share if the farm set one — and her sex. */
export interface GainJudged {
  /** Whether her breed is deshi; null when nobody wrote down her breed. */
  deshi: boolean | null;
  sex: "male" | "female";
  /** Her Breed's own share of a Ration's Expected Gain, as a percentage; null or left out when it has none. */
  breedPercent?: number | null;
}

/**
 * The Expected Gain one animal is judged against: her Ration's, which is written for a crossbred bull, cut to her
 * Breed's own share where the farm has set one — else to the farm's deshi share when she is deshi — and to its female
 * share when she is a cow or heifer, on top. A Breed's own share stands in for the deshi share, never beside it: it is
 * what the farm's own animals of that Breed put on, deshi or not. Each end is cut alike and kept to the hundredth, as
 * the Ration's are.
 */
export const expectedGainFor = (
  asWritten: ExpectedGain,
  animal: GainJudged,
  shares: GainShares
): { expectedGain: ExpectedGain; adjustedFor: GainAdjustment } => {
  const breedPercent = animal.breedPercent ?? null;
  const adjustedFor: GainAdjustment = {
    breedPercent,
    deshiPercent:
      breedPercent === null && animal.deshi === true
        ? shares.deshiPercent
        : null,
    femalePercent: animal.sex === "female" ? shares.femalePercent : null,
    breedRecorded: animal.deshi !== null,
  };
  const share =
    ((breedPercent ?? adjustedFor.deshiPercent ?? PERCENT) / PERCENT) *
    ((adjustedFor.femalePercent ?? PERCENT) / PERCENT);
  const cut = (kg: number) => Math.round(kg * share * RATE_SCALE) / RATE_SCALE;
  return {
    expectedGain: {
      lowKg: cut(asWritten.lowKg),
      highKg: cut(asWritten.highKg),
    },
    adjustedFor,
  };
};

/** Whether a standing is one the farm is told of: a bull gaining under what his Ration should give him, or losing. */
export const isShortOfExpected = (standing: GainStanding): boolean =>
  standing === "losing" || standing === "under";

/** A Ration the farm feeds by weight and what it should put on a crossbred bull: one rung of the ladder a bull climbs. */
export interface GainingBand {
  band: WeightBand;
  expectedGain: ExpectedGain;
}

/** The rung a bull of this weight stands on: the first whose band his weight fits, in the order given. */
export const gainingBandFor = (
  weightKg: number,
  rungs: readonly GainingBand[]
): GainingBand | null =>
  rungs.find((rung) => bandStanding(weightKg, rung.band) === "fits") ?? null;

/** The most days ahead a weight is grown: past a year and a half, no Ration and no Target Window mean anything. */
const MOST_DAYS_GROWN = 540;

/**
 * What a bull should weigh `days` after he came, low and high: his weight then, grown after he has settled in — the
 * first three weeks count for nothing — a day at a time at the Expected Gain of whichever of the farm's Rations his
 * weight is in that day, cut for his being deshi or female, stepping up to the next as he crosses its band
 * (docs/research/expected-daily-gain.md, "Settling-in and the suggested target weight"). Grown past every band the
 * farm has a figure for, he goes on at the heaviest one's. Nothing when no Ration's band holds him as he comes: there
 * is nothing on the farm to say what he should gain.
 */
export const grownWeightFor = (
  arrivalKg: number,
  days: number,
  rungs: readonly GainingBand[],
  animal: GainJudged,
  shares: GainShares
): { lowKg: number; highKg: number } | null => {
  if (!gainingBandFor(arrivalKg, rungs)) {
    return null;
  }
  const growingDays = Math.min(
    Math.max(0, Math.round(days) - SETTLING_IN_DAYS),
    MOST_DAYS_GROWN
  );
  const grownAt = (end: keyof ExpectedGain): number => {
    let kg = arrivalKg;
    let rung = gainingBandFor(kg, rungs);
    for (let day = 0; day < growingDays; day += 1) {
      rung = gainingBandFor(kg, rungs) ?? rung;
      if (!rung) {
        break;
      }
      kg += expectedGainFor(rung.expectedGain, animal, shares).expectedGain[
        end
      ];
    }
    return roundKg(kg);
  };
  return { lowKg: grownAt("lowKg"), highKg: grownAt("highKg") };
};

/**
 * Her gain over the whole of one stay on a Ration: from the first reading the farm did not doubt on or after `from` to
 * the last before `until`, when they are at least `readDays` farm days apart — the longest span, and so the least
 * thrown by a full gut, that her stay gives. Nothing when her stay gave no two readings that far apart.
 */
export const gainOverStayOf = (
  readings: readonly WeighIn[],
  { from, until, readDays }: { from: Date; until: Date; readDays: number }
): GainOnRation | null => {
  const within = readings
    .filter((one) => one.weighedAt >= from && one.weighedAt < until)
    .toSorted((a, b) => a.weighedAt.getTime() - b.weighedAt.getTime());
  const first = within.at(0);
  const last = within.at(-1);
  if (!(first && last)) {
    return null;
  }
  const overDays = farmDaysApart(
    farmDayOf(first.weighedAt),
    farmDayOf(last.weighedAt)
  );
  if (overDays < Math.max(readDays, 1)) {
    return null;
  }
  return {
    dailyGainKg:
      Math.round(((last.weightKg - first.weightKg) / overDays) * RATE_SCALE) /
      RATE_SCALE,
    overDays,
    from: first,
    to: last,
  };
};

/**
 * The kinds of animal the farm's own gains are said by, as her range is cut: crossbred bulls — whom a Ration's figures
 * are written for — deshi bulls, bulls nobody wrote a Breed for, and crossbred cows and heifers.
 */
export const GAIN_GROUPS = ["cross", "deshi", "unrecorded", "female"] as const;
export type GainGroup = (typeof GAIN_GROUPS)[number];

/**
 * Which of them she is, or none: the female figure is offered as the share a cow takes on top of her Breed's, so only a
 * crossbred cow's gain is in it. A deshi cow's, or one nobody wrote a Breed for, would carry the deshi cut into the
 * female share, and a deshi cow judged by both would be cut twice.
 */
export const gainGroupOf = ({
  sex,
  deshi,
}: {
  sex: "male" | "female";
  /** Whether her Breed is deshi; null when nobody wrote one down. */
  deshi: boolean | null;
}): GainGroup | null => {
  if (sex === "female") {
    return deshi === false ? "female" : null;
  }
  if (deshi === null) {
    return "unrecorded";
  }
  return deshi ? "deshi" : "cross";
};

/** The fewest animals a figure of the farm's own is said from: fewer, and it says more about those animals than about
 *  the Ration (the Owner's choice, 2026-09-29). */
export const FEWEST_FOR_A_FIGURE = 5;

/** What a group of the farm's animals put on eating a Ration: how many, the middle one, and the middle half of them. */
export interface FarmGainFigure {
  animals: number;
  medianKg: number;
  /** The quarter of the way up, and three quarters: the middle half of the farm's animals lie between. */
  lowKg: number;
  highKg: number;
}

/** The figure at a share of the way up sorted gains, between two where it falls between them. */
const atShare = (sorted: readonly number[], share: number): number => {
  const at = (sorted.length - 1) * share;
  const below = Math.floor(at);
  const above = Math.ceil(at);
  const lower = sorted[below] ?? 0;
  const upper = sorted[above] ?? lower;
  return lower + (upper - lower) * (at - below);
};

const QUARTER = 0.25;
const HALF = 0.5;
const THREE_QUARTERS = 0.75;

/** What these gains come to as a figure of the farm's own, or nothing from fewer than `FEWEST_FOR_A_FIGURE`. */
export const farmGainFigureOf = (
  gains: readonly number[]
): FarmGainFigure | null => {
  if (gains.length < FEWEST_FOR_A_FIGURE) {
    return null;
  }
  const sorted = gains.toSorted((a, b) => a - b);
  const rate = (value: number) => Math.round(value * RATE_SCALE) / RATE_SCALE;
  return {
    animals: gains.length,
    medianKg: rate(atShare(sorted, HALF)),
    lowKg: rate(atShare(sorted, QUARTER)),
    highKg: rate(atShare(sorted, THREE_QUARTERS)),
  };
};

/** The fewest animals in a Pen with a gain on its Ration before their middle is a group to measure one of them
 *  against: the bull tests' smallest group (docs/research/expected-gain.md §6.2). */
export const PEN_NEEDS_GAINS = 4;

/** A gain as a share of what her own Ration should give her — the middle of her own range — so animals of different
 *  breeds and sexes in one Pen can be set beside each other. */
export const gainShareOf = (
  dailyGainKg: number,
  expectedGain: ExpectedGain
): number => dailyGainKg / ((expectedGain.lowKg + expectedGain.highKg) / 2);

/** The middle of a Pen's shares, or nothing while fewer than `PEN_NEEDS_GAINS` animals have one. */
export const penShareOf = (shares: readonly number[]): number | null =>
  shares.length < PEN_NEEDS_GAINS
    ? null
    : atShare(
        shares.toSorted((a, b) => a - b),
        HALF
      );

/**
 * Whether she is gaining under the farm's share of what her penmates gain, each set against what their Ration should
 * give them: how the bull tests judge a bull, against his group. It catches the slow one in a Pen that is all slow —
 * a hot month, a poor load of feed — which her Ration's figures alone cannot, and it says nothing of a Pen too small to
 * be a group.
 */
export const isUnderPenmates = (
  share: number,
  penShare: number | null,
  percent: number
): boolean =>
  penShare !== null && penShare > 0 && share < (penShare * percent) / PERCENT;

/** One measured stay of a bull on a Ration, and what that Ration is written to give a crossbred bull. */
export interface MeasuredStay {
  dailyGainKg: number;
  overDays: number;
  /** The Ration's Expected Gain as written — never cut for his Breed: a Breed's share is what is being measured. */
  expectedGain: ExpectedGain;
}

/**
 * What one bull put on as a percentage of what his Ration should give a crossbred bull: read off his longest measured
 * stay on a Ration with an Expected Gain, against the middle of its range as written. One figure a bull, however many
 * Rations he ate, so a Breed reaches a figure of its own across Rations. Nothing for a bull with no measured stay.
 */
export const bullShareOf = (stays: readonly MeasuredStay[]): number | null => {
  let longest: MeasuredStay | null = null;
  for (const one of stays) {
    if (!longest || one.overDays > longest.overDays) {
      longest = one;
    }
  }
  return longest
    ? gainShareOf(longest.dailyGainKg, longest.expectedGain) * PERCENT
    : null;
};

/** What a Breed's bulls on the farm put on, as a share of what their Rations should give them: how many, the middle
 *  one, and the middle half, each to the whole percent. */
export interface BreedShareFigure {
  animals: number;
  medianPercent: number;
  lowPercent: number;
  highPercent: number;
}

/** What these bulls' shares come to as a figure of the farm's own for their Breed, or nothing from fewer than
 *  `FEWEST_FOR_A_FIGURE`: the same middle and middle half as a Ration's figure. */
export const breedShareFigureOf = (
  shares: readonly number[]
): BreedShareFigure | null => {
  if (shares.length < FEWEST_FOR_A_FIGURE) {
    return null;
  }
  const sorted = shares.toSorted((a, b) => a - b);
  return {
    animals: shares.length,
    medianPercent: Math.round(atShare(sorted, HALF)),
    lowPercent: Math.round(atShare(sorted, QUARTER)),
    highPercent: Math.round(atShare(sorted, THREE_QUARTERS)),
  };
};

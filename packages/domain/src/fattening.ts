import { roundKg } from "./feed";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The period the farm intends to sell an Animal in. Days, as a calendar names them. */
export interface TargetWindow {
  start: string;
  end: string;
}

/** `day` plus `days`, as "YYYY-MM-DD". Read as UTC throughout: a calendar day plus two is the
 *  same calendar day plus two whatever clock the reader keeps. */
export const addDays = (day: string, days: number): string => {
  const at = new Date(`${day}T00:00:00Z`);
  return new Date(at.getTime() + days * DAY_MS).toISOString().slice(0, 10);
};

/**
 * What a beast can plausibly do between two weighings.
 *
 * Not a Farm Parameter: these are facts about cattle rather than about this farm. A fattening
 * bull on good feed gains about a kilo a day and exceptionally two; three is a scale read wrong,
 * a tag read wrong, or two animals confused. Loss is allowed more room in one direction than gain
 * is in the other, because an animal can go off its feed for a fortnight and a sick one can drop
 * fast, and the farm would rather be told that than argued with.
 */
export const PLAUSIBLE_DAILY_GAIN_KG = 2.5;
export const PLAUSIBLE_DAILY_LOSS_KG = 3;

/** Below this, two readings are too close together in time for a daily rate to mean anything —
 *  two weighings on the same morning differ by what the animal drank. Kept by everything that
 *  divides a weight change by a span, so nothing quotes a rate off a few hours. */
const RATE_NEEDS_DAYS = 1;

/**
 * Why a reading should be queried before the farm accepts it, or null when it is unremarkable.
 *
 * Only the farm's own records can tell: a phone that has not synced does not know what she
 * weighed a fortnight ago, so the question is asked where her history is.
 */
export const implausibleChange = (
  last: { weightKg: number; weighedAt: Date } | null,
  now: { weightKg: number; weighedAt: Date }
): { dailyKg: number; days: number; lastKg: number } | null => {
  if (!last) {
    return null;
  }
  const days =
    (now.weighedAt.getTime() - last.weighedAt.getTime()) /
    (24 * 60 * 60 * 1000);
  if (days < RATE_NEEDS_DAYS) {
    return null;
  }
  const dailyKg = (now.weightKg - last.weightKg) / days;
  const impossible =
    dailyKg > PLAUSIBLE_DAILY_GAIN_KG || dailyKg < -PLAUSIBLE_DAILY_LOSS_KG;
  return impossible ? { dailyKg, days, lastKg: last.weightKg } : null;
};

/** One reading on the scale: what she weighed and when. */
export interface WeighIn {
  weightKg: number;
  weighedAt: Date;
}

/**
 * A rate of gain, the span it was measured over, and where it lands her.
 *
 * Two of these are worked out for every fattening animal — one over her whole stay and one over
 * the last fortnight — because the gap between them is what tells the farm a ration has stopped
 * working. A single figure would average that away.
 */
export interface GainBasis {
  /** Kilogrammes a day. Negative when she is losing. */
  dailyGainKg: number;
  /** How many days the rate was measured over, so nobody reads a fortnight as a season. */
  overDays: number;
  /** What she would weigh when the Target Window opens, at this rate. Null when the window
   *  has already opened: there is nothing left to project across. */
  projectedKg: number | null;
  /** Whether that makes her target weight. Null when there is no projection to judge. */
  reachesTarget: boolean | null;
}

/** What the farm knows about one fattening animal beyond the readings themselves. */
export interface FatteningView {
  /** How long she has been on the farm being fed, to today. Null for an animal born here:
   *  there is no arrival to count from, and weaning is Breeding's to record (increment 5). */
  daysOnFeed: number | null;
  /** What she weighs now: her last reading, or what she weighed off the lorry. Null for an
   *  animal born here who has never been on the scale — the farm does not know. */
  latestKg: number | null;
  latestAt: Date | null;
  /** What she is being fed towards, when somebody said. */
  targetWeightKg: number | null;
  /** Over her whole stay, from what she weighed off the lorry. Null for an animal the farm did
   *  not buy in, and until she has been on the scale at least once. */
  sinceIntake: GainBasis | null;
  /** Between her last two readings. Null until there are two — one reading is not a trend. */
  recent: GainBasis | null;
  /** Whether she will make her target weight. Null when there is no rate to judge on. */
  onTrack: boolean | null;
  /** Which of the two the verdict came from, so a board ranking by it can say so rather than
   *  ranking two animals by different measures without a word. */
  onTrackFrom: "recent" | "sinceIntake" | null;
}

const daysBetween = (from: Date, to: Date): number =>
  (to.getTime() - from.getTime()) / DAY_MS;

/** The whole days from one instant to a later one, and none backwards. */
export const wholeDaysFrom = (from: Date, to: Date): number =>
  Math.max(0, Math.round(daysBetween(from, to)));

/** How long a bought-in Animal has been on the Farm being fed, counted from her Intake in whole days. */
export const daysOnFeedOf = (arrivedAt: Date, now: Date): number =>
  wholeDaysFrom(arrivedAt, now);

/** Rates carry a decimal more than kilogrammes do: a fattening bull's whole day's work is the
 *  second decimal place. */
const RATE_SCALE = 100;
const toRate = (value: number): number =>
  Math.round(value * RATE_SCALE) / RATE_SCALE;

/**
 * A rate of gain from one weighing to another, and where it lands her at the window.
 *
 * Projected from the *unrounded* rate and rounded once at the end: rounding the rate first and
 * multiplying it by ninety days turns a hundredth of a kilo into most of a kilo.
 */
const basisFrom = (
  from: { weightKg: number; at: Date },
  to: { weightKg: number; at: Date },
  windowOpensAt: Date | null,
  targetWeightKg: number | null
): GainBasis | null => {
  const overDays = daysBetween(from.at, to.at);
  // The same floor the plausibility check keeps: a daily rate over a few hours is noise, and
  // two weighings on one morning differ by what the animal drank.
  if (overDays < RATE_NEEDS_DAYS) {
    return null;
  }
  const rate = (to.weightKg - from.weightKg) / overDays;
  const toGo = windowOpensAt === null ? 0 : daysBetween(to.at, windowOpensAt);
  const projectedKg = toGo > 0 ? roundKg(to.weightKg + rate * toGo) : null;
  return {
    dailyGainKg: toRate(rate),
    overDays: Math.round(overDays),
    projectedKg,
    reachesTarget:
      projectedKg === null || targetWeightKg === null
        ? null
        : projectedKg >= targetWeightKg,
  };
};

/**
 * Which of the two rates the verdict came from: the recent one when there is one, because a bull
 * who gained well for three months and nothing for the last fortnight is a bull who has stopped.
 */
const whichRate = (
  recent: GainBasis | null,
  sinceIntake: GainBasis | null
): FatteningView["onTrackFrom"] => {
  if (recent) {
    return "recent";
  }
  return sinceIntake ? "sinceIntake" : null;
};

/**
 * What the scale means, worked out and never typed: how long she has been fed, how fast she is
 * gaining, and what she will weigh when her Target Window opens.
 *
 * Derived on every read rather than stored, because every one of these answers changes when the
 * next reading arrives, and a farm holding a projection from March would be reading a number
 * that stopped being true in April.
 */
export const fatteningView = (
  /** How she arrived, for an animal the farm bought in. Null for one born here: she is on the
   *  Fattening side and being weighed, but there is no arrival weight to measure gain from. */
  intake: {
    weightKg: number;
    arrivedAt: Date;
    targetWeightKg: number;
  } | null,
  /** Her readings, oldest first. */
  weighIns: WeighIn[],
  windowOpensAt: Date | null,
  now: Date
): FatteningView => {
  const latest = weighIns.at(-1);
  const previous = weighIns.at(-2);
  const targetWeightKg = intake?.targetWeightKg ?? null;
  const sinceIntake =
    latest && intake
      ? basisFrom(
          { weightKg: intake.weightKg, at: intake.arrivedAt },
          { weightKg: latest.weightKg, at: latest.weighedAt },
          windowOpensAt,
          targetWeightKg
        )
      : null;
  const recent =
    latest && previous
      ? basisFrom(
          { weightKg: previous.weightKg, at: previous.weighedAt },
          { weightKg: latest.weightKg, at: latest.weighedAt },
          windowOpensAt,
          targetWeightKg
        )
      : null;
  // The rate she is going at now, and which of the two it is: a board that ranks by the verdict
  // should be able to say so rather than ranking two animals by different measures in silence.
  const current = recent ?? sinceIntake;
  const onTrackFrom = whichRate(recent, sinceIntake);
  const daysOnFeed = intake ? daysOnFeedOf(intake.arrivedAt, now) : null;
  return {
    daysOnFeed,
    latestKg: latest?.weightKg ?? intake?.weightKg ?? null,
    latestAt: latest?.weighedAt ?? intake?.arrivedAt ?? null,
    targetWeightKg,
    sinceIntake,
    recent,
    onTrack: current?.reachesTarget ?? null,
    onTrackFrom,
  };
};

/**
 * Eid-ul-Adha, as Bangladesh expects to keep it.
 *
 * A table and not a calculation, because the day is not calculable: it is 10 Dhul Hijjah, fixed
 * for Bangladesh by the moon sighting committee, and typically one day after Saudi Arabia. These
 * are the expected dates, which is all anyone has until the announcement — so the Manager may
 * move any animal's Target Window, and once the year's date is announced these become history
 * rather than a guess.
 *
 * The farm sells into this market every year, so the table is kept a decade ahead: an animal
 * bought today is fed towards a date, and a farm that cannot name the date cannot project to it.
 */
export const EID_UL_ADHA = [
  "2026-05-28",
  "2027-05-17",
  "2028-05-06",
  "2029-04-25",
  "2030-04-14",
  "2031-04-03",
  "2032-03-23",
  "2033-03-12",
  "2034-03-02",
  "2035-02-19",
  "2036-02-08",
] as const;

/** Qurbani runs the tenth, eleventh and twelfth of Dhul Hijjah: three days of selling, not one. */
export const QURBANI_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The period the farm intends to sell an Animal in. Days, as a calendar names them. */
export interface TargetWindow {
  start: string;
  end: string;
}

/** `day` plus `days`, as "YYYY-MM-DD". Read as UTC throughout: a calendar day plus two is the
 *  same calendar day plus two whatever clock the reader keeps. */
const addDays = (day: string, days: number): string => {
  const at = new Date(`${day}T00:00:00Z`);
  return new Date(at.getTime() + days * DAY_MS).toISOString().slice(0, 10);
};

/**
 * The Eid the farm is feeding towards from `today`: the next one, or the one it is standing in.
 *
 * An animal bought on the second day of Qurbani is not being fed for a market that closes
 * tomorrow, but the farm is still in that market — so a window is current until its last day is
 * past, and only then does the next year's become the default.
 *
 * Null once the table runs out, which is a reason to extend it rather than to guess.
 */
export const nextEidWindow = (today: string): TargetWindow | null => {
  for (const day of EID_UL_ADHA) {
    const end = addDays(day, QURBANI_DAYS - 1);
    if (end >= today) {
      return { start: day, end };
    }
  }
  return null;
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
 *  two weighings on the same morning differ by what the animal drank. */
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
export interface Weighing {
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
  /** How long she has been on the farm being fed, to today. */
  daysOnFeed: number;
  /** What she weighs now: her last reading, or what she weighed off the lorry. */
  latestKg: number;
  latestAt: Date;
  targetWeightKg: number;
  /** Over her whole stay. Null until she has been on the scale at least once. */
  sinceIntake: GainBasis | null;
  /** Between her last two readings. Null until there are two — one reading is not a trend. */
  recent: GainBasis | null;
  /** Whether she will make her target weight, judged on the rate she is going at *now* —
   *  which is the recent one when there is one. Null when neither rate can be worked out. */
  onTrack: boolean | null;
}

const daysBetween = (from: Date, to: Date): number =>
  (to.getTime() - from.getTime()) / DAY_MS;

/** Kilogrammes to one decimal, which is what a crush scale reads and what the farm writes down. */
const KG_SCALE = 10;
const toKg = (value: number): number => Math.round(value * KG_SCALE) / KG_SCALE;
/** Rates carry a decimal more: a fattening bull's whole day's work is the second one. */
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
  windowOpensAt: Date,
  targetWeightKg: number
): GainBasis | null => {
  const overDays = daysBetween(from.at, to.at);
  if (overDays <= 0) {
    return null;
  }
  const rate = (to.weightKg - from.weightKg) / overDays;
  const toGo = daysBetween(to.at, windowOpensAt);
  const projectedKg = toGo > 0 ? toKg(to.weightKg + rate * toGo) : null;
  return {
    dailyGainKg: toRate(rate),
    overDays: Math.round(overDays),
    projectedKg,
    reachesTarget: projectedKg === null ? null : projectedKg >= targetWeightKg,
  };
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
  intake: { weightKg: number; arrivedAt: Date; targetWeightKg: number },
  /** Her readings, oldest first. */
  weighings: Weighing[],
  windowOpensAt: Date,
  now: Date
): FatteningView => {
  const latest = weighings.at(-1);
  const previous = weighings.at(-2);
  const start = { weightKg: intake.weightKg, at: intake.arrivedAt };
  const sinceIntake = latest
    ? basisFrom(
        start,
        { weightKg: latest.weightKg, at: latest.weighedAt },
        windowOpensAt,
        intake.targetWeightKg
      )
    : null;
  const recent =
    latest && previous
      ? basisFrom(
          { weightKg: previous.weightKg, at: previous.weighedAt },
          { weightKg: latest.weightKg, at: latest.weighedAt },
          windowOpensAt,
          intake.targetWeightKg
        )
      : null;
  // The rate she is going at now, which is the recent one when there is one: a bull who gained
  // well for three months and nothing for the last fortnight is a bull who has stopped.
  const current = recent ?? sinceIntake;
  return {
    daysOnFeed: Math.max(0, Math.round(daysBetween(intake.arrivedAt, now))),
    latestKg: latest?.weightKg ?? intake.weightKg,
    latestAt: latest?.weighedAt ?? intake.arrivedAt,
    targetWeightKg: intake.targetWeightKg,
    sinceIntake,
    recent,
    onTrack: current?.reachesTarget ?? null,
  };
};

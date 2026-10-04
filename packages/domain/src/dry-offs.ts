const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a cow should stand dry between Lactations, and how long a Lactation runs. Shorter than the low and her udder
 * has not rebuilt, and the next Lactation gives less; longer than the high and she is fat at calving, and the farm fed
 * her for nothing. A Lactation is reckoned at three hundred and five days, give or take.
 */
export const DRY_OFF_TARGETS = {
  dryPeriodDays: { low: 45, high: 60 },
  lactationDays: { low: 280, high: 320 },
} as const;

/** A cow as her Lactations are read: what she is now, the calvings that began them and the dry-offs that ended them. */
export interface CowDryOffs {
  state: string;
  lactationNumber: number;
  lactationStartedAt: Date | null;
  calvings: readonly { calvedAt: Date; lactationNumber: number }[];
  /** Each carrying when the Lactation it ended began, as the cow had it on the day: a Lactation begun by a change of
   *  State rather than a recorded Calving has no calving to read it from. */
  dryOffs: readonly {
    lactationNumber: number;
    driedAt: Date;
    lactationStartedAt?: Date | null;
  }[];
}

/** One Lactation, from her calving to her dry-off, and the dry period after it to the calving that began the next. */
export interface LactationSpan {
  lactationNumber: number;
  /** When it began: her calving, or for one begun before the farm kept books, the day the register gives. */
  startedAt: Date | null;
  driedAt: Date | null;
  /** The calving that ended her dry period, once she has calved again. */
  nextCalvedAt: Date | null;
  /** From its start to her dry-off; nothing while she is in milk or where either is unknown. */
  lactationDays: number | null;
  /** From her dry-off to her next calving — or to now while she is still dry. */
  dryDays: number | null;
  /** Dry now, waiting to calve: `dryDays` is still counting. */
  stillDry: boolean;
}

const wholeDaysBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / DAY_MS);

const meanOf = (values: readonly number[]): number | null =>
  values.length === 0
    ? null
    : Math.round(values.reduce((sum, one) => sum + one, 0) / values.length);

const within = (at: Date | null, from: Date, until: Date): at is Date =>
  at !== null && at >= from && at < until;

/** Her dry period after a Lactation dried off on `driedAt`: to her next calving, or to now while she is dry for it. */
const dryPeriodOf = (
  driedAt: Date | null,
  nextCalvedAt: Date | null,
  stillDry: boolean,
  now: Date
): number | null => {
  if (driedAt === null) {
    return null;
  }
  if (nextCalvedAt !== null) {
    return wholeDaysBetween(driedAt, nextCalvedAt);
  }
  return stillDry ? wholeDaysBetween(driedAt, now) : null;
};

/**
 * Every Lactation the farm knows of hers, latest first: those it saw her calve into, those it saw her dried off from,
 * and the one she is in. Read from the record, never typed — a Lactation without a dry-off written has no length.
 */
export const lactationsOf = (cow: CowDryOffs, now: Date): LactationSpan[] => {
  const calvedInto = new Map(
    cow.calvings.map((one) => [one.lactationNumber, one.calvedAt])
  );
  const driedFrom = new Map(
    cow.dryOffs.map((one) => [one.lactationNumber, one])
  );
  // Where each began: her calving into it, else what its dry-off kept, else — for the one she is in — her own record.
  const beganOn = (lactationNumber: number): Date | null =>
    calvedInto.get(lactationNumber) ??
    driedFrom.get(lactationNumber)?.lactationStartedAt ??
    (lactationNumber === cow.lactationNumber ? cow.lactationStartedAt : null);
  const numbers = new Set([...calvedInto.keys(), ...driedFrom.keys()]);
  if (cow.lactationNumber > 0) {
    numbers.add(cow.lactationNumber);
  }
  return [...numbers]
    .toSorted((a, b) => b - a)
    .map((lactationNumber) => {
      const current = lactationNumber === cow.lactationNumber;
      const startedAt = beganOn(lactationNumber);
      const driedAt = driedFrom.get(lactationNumber)?.driedAt ?? null;
      const nextCalvedAt = beganOn(lactationNumber + 1);
      const stillDry = current && cow.state === "dry" && driedAt !== null;
      return {
        lactationNumber,
        startedAt,
        driedAt,
        nextCalvedAt,
        lactationDays:
          startedAt !== null && driedAt !== null
            ? wholeDaysBetween(startedAt, driedAt)
            : null,
        dryDays: dryPeriodOf(driedAt, nextCalvedAt, stillDry, now),
        stillDry,
      };
    });
};

/** The herd's Dry-offs over a stretch: its Dry Periods and the Lactations they ended. */
export interface HerdDryOffs {
  /** Days dry on average, over the dry periods that ended — in a calving — in the stretch. */
  dryPeriodDays: number | null;
  dryPeriods: number;
  /** Days in milk on average, over the Lactations dried off in the stretch. */
  lactationDays: number | null;
  lactations: number;
  /** The dry periods that ended in the stretch shorter or longer than the target, a cow to each. */
  outsideTarget: {
    tagNumber: string;
    lactationNumber: number;
    dryDays: number;
  }[];
}

/** How the herd's cows were dried off over `from`–`until`, each figure read from the events that fell in it. */
export const herdDryOffs = (
  cows: readonly (CowDryOffs & { tagNumber: string })[],
  { from, until, now = until }: { from: Date; until: Date; now?: Date }
): HerdDryOffs => {
  const spans = cows.flatMap((cow) =>
    lactationsOf(cow, now).map((span) => ({
      ...span,
      tagNumber: cow.tagNumber,
    }))
  );
  const ended = spans.filter(
    (span): span is typeof span & { dryDays: number } =>
      within(span.nextCalvedAt, from, until) && span.dryDays !== null
  );
  const dried = spans.flatMap((span) =>
    within(span.driedAt, from, until) && span.lactationDays !== null
      ? [span.lactationDays]
      : []
  );
  const { low, high } = DRY_OFF_TARGETS.dryPeriodDays;
  return {
    dryPeriodDays: meanOf(ended.map((span) => span.dryDays)),
    dryPeriods: ended.length,
    lactationDays: meanOf(dried),
    lactations: dried.length,
    outsideTarget: ended
      .filter((span) => span.dryDays < low || span.dryDays > high)
      .map((span) => ({
        tagNumber: span.tagNumber,
        lactationNumber: span.lactationNumber,
        dryDays: span.dryDays,
      })),
  };
};

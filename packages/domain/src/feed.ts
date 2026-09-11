/**
 * What a Pen is fed, and how much of it one session calls for.
 *
 * The farm states a Ration the way a farmer states it — so many kilos of each Feed Item per
 * animal per day — and the number that reaches the person with the bucket is worked out from
 * the herd standing in that Pen at that moment. Nobody types a figure the farm already knows,
 * and a Pen that gains three animals is fed for three more without anybody remembering to
 * change anything.
 */

/** Feed is weighed on a barn scale; a hundred grams is as fine as the answer can honestly be. */
export const KG_DECIMALS = 1;
const KG_SCALE = 10 ** KG_DECIMALS;

/** Kilos as the record keeps them — the one rounding, shared by the arithmetic and the
 *  column, so the two cannot drift apart. */
export const roundKg = (value: number): number =>
  Math.round(value * KG_SCALE) / KG_SCALE;

/** The most one animal can sensibly be given of one Item in a day. */
export const MAX_KG_PER_ANIMAL_PER_DAY = 100;

export interface RationLine {
  feedItemId: string;
  kgPerAnimalPerDay: number;
}

/** One Feed Item's share of one session, for the animals actually standing in the Pen. */
export const perSessionKg = (
  kgPerAnimalPerDay: number,
  animals: number,
  sessionsPerDay: number
): number => {
  if (sessionsPerDay < 1) {
    throw new Error("A ration is fed at least once a day");
  }
  return roundKg((kgPerAnimalPerDay * animals) / sessionsPerDay);
};

/** What is wrong with a Ration, in the Manager's terms rather than the parser's. */
export const findRationProblems = (ration: {
  items: RationLine[];
}): string[] => {
  const problems: string[] = [];
  if (ration.items.length === 0) {
    problems.push("items: a ration needs something in it");
  }
  const seen = new Set<string>();
  for (const [index, line] of ration.items.entries()) {
    if (seen.has(line.feedItemId)) {
      problems.push(`items[${index}]: that feed is already in this ration`);
    }
    seen.add(line.feedItemId);
    if (
      !Number.isFinite(line.kgPerAnimalPerDay) ||
      line.kgPerAnimalPerDay <= 0 ||
      line.kgPerAnimalPerDay > MAX_KG_PER_ANIMAL_PER_DAY
    ) {
      problems.push(
        `items[${index}].kgPerAnimalPerDay: between nothing and ${MAX_KG_PER_ANIMAL_PER_DAY} kg a day`
      );
    }
  }
  return problems;
};

/** What a Step that feeds a Pen says went out, per Feed Item. */
export interface FeedingEntryLine {
  feedItemId: string;
  givenKg: number;
  leftoverKg?: number;
}

export interface FeedingLine {
  feedItemId: string;
  targetKg: number;
  givenKg: number;
  leftoverKg: number;
}

/**
 * How far under its Feeding Target a session came: the Feed Item that fell shortest.
 *
 * Item by item rather than in total, because a Feed Item is measured in its own unit — straw
 * in bales, molasses in litres — and a total that adds bales to litres is arithmetic that
 * means nothing. It is also the answer the farm wants: a Pen that got its silage and none of
 * its concentrate has a problem, and a total would average it away.
 *
 * Leftover counts against what was eaten, not against what was given: the trough is the
 * measure of the meal.
 */
export const shortfallPercent = (lines: FeedingLine[]): number => {
  let worst = 0;
  for (const line of lines) {
    if (line.targetKg <= 0) {
      continue;
    }
    const eaten = Math.max(line.givenKg - line.leftoverKg, 0);
    const short = Math.round(((line.targetKg - eaten) / line.targetKg) * 100);
    worst = Math.max(worst, short);
  }
  return Math.max(worst, 0);
};

/** Was this session short enough to be worth saying out loud? */
export const isShortFed = (lines: FeedingLine[], tolerancePercent: number) =>
  shortfallPercent(lines) > tolerancePercent;

/**
 * How a group of fattening Animals grew while the Farm held them — a Season, or one line of its breakdown: the kilos a
 * day they put on together, how long they were fed, and what each kilo cost. Pooled — every kilo over every day, every
 * taka over every kilo — never a mean of each Animal's own, which a bull weighed twice in a week would swing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** One Animal's Holding as growth reads it. */
export interface GrowthHolding {
  takenOn: Date;
  /** When she left, or today for one standing. */
  until: Date;
  /** What she weighed coming to it: her Intake's weight, or what she weighed when she joined. */
  cameKg: number | null;
  /** What she weighed going, where she was sold within it. */
  soldKg: number | null;
  /** Her Weigh-ins the farm did not doubt, any order. */
  readings: readonly { kg: number; at: Date }[];
  /** Everything charged to her within it, her price apart: what her kilos cost. */
  chargedMoney: number;
}

export interface Growth {
  /** Kilos a day, all of them together; nothing where none was weighed both ways. */
  gainKgPerDay: number | null;
  /** How many of them were weighed coming and since — what the figure is read from. */
  weighed: number;
  /** Days on Feed, on average, from coming to going or today. */
  daysOnFeed: number | null;
  /** What each kilo they put on cost; nothing where they put none on. */
  costOfGainMoney: number | null;
}

/** Her last weight inside the Holding, and when: her sale weight where she was sold, else her last Weigh-in. */
const endOf = (one: GrowthHolding): { kg: number; at: Date } | null => {
  if (one.soldKg !== null) {
    return { kg: one.soldKg, at: one.until };
  }
  return (
    one.readings
      .filter((reading) => reading.at > one.takenOn && reading.at <= one.until)
      .toSorted((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null
  );
};

/** How a group grew, pooled. */
export const growthOf = (holdings: readonly GrowthHolding[]): Growth => {
  let kilos = 0;
  let days = 0;
  let money = 0;
  let weighed = 0;
  for (const one of holdings) {
    const end = endOf(one);
    const span = end ? (end.at.getTime() - one.takenOn.getTime()) / DAY_MS : 0;
    if (one.cameKg === null || !end || span < 1) {
      continue;
    }
    weighed += 1;
    kilos += end.kg - one.cameKg;
    days += span;
    money += one.chargedMoney;
  }
  const fed = holdings.map(
    (one) => (one.until.getTime() - one.takenOn.getTime()) / DAY_MS
  );
  return {
    gainKgPerDay: days > 0 ? Math.round((kilos / days) * 100) / 100 : null,
    weighed,
    daysOnFeed:
      fed.length === 0
        ? null
        : Math.round(fed.reduce((sum, one) => sum + one, 0) / fed.length),
    costOfGainMoney: kilos > 0 ? Math.round((money / kilos) * 100) / 100 : null,
  };
};

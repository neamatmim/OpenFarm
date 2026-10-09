import type { GrowthHolding } from "./fattening-growth";
import { growthOf } from "./fattening-growth";
import { roundKg } from "./feed";
import type { ExitState } from "./lifecycle";

/**
 * One Animal's stretch as one Venture's, as a past moment asks of it: from the day she became its — off the lorry, or
 * bought across from another owner by an Internal Sale — to the day she stopped being, and how; what she weighed coming
 * and, sold to a buyer, at the gate; and every Weigh-in the farm did not doubt, before and after.
 */
export interface VentureHolding {
  animalId: string;
  tagNumber: string;
  from: Date;
  cameBy: "intake" | "internal_sale";
  /** Her Intake's weight, or what she weighed at the Internal Sale that brought her; nothing where neither was taken. */
  cameKg: number | null;
  /** When she stopped being the Venture's; nothing while she still is. */
  until: Date | null;
  /** How she stopped being the Venture's: across to another owner by an Internal Sale, or however she left the farm. */
  wentBy: ExitState | "internal_sale" | null;
  /** What she weighed at the gate, where she went to a buyer. */
  soldKg: number | null;
  readings: readonly { kg: number; at: Date }[];
}

/** A stretch of time, its start counted in and its end not: a month, as the farm's days begin and end it. */
export interface Between {
  from: Date;
  until: Date;
}

/**
 * Whether she was the Venture's at a moment: she had come before it, and had not gone before it. So the heads at a
 * month's start, with those that came in it and less those that went, are the heads at its end — an Animal coming at
 * the very moment a month begins is one that came in it, and one going at the moment it ends went in the next.
 */
const heldAt = (one: VentureHolding, at: Date) =>
  one.from < at && (one.until === null || one.until >= at);

/** Whether a moment falls inside a stretch: on or after its start, before its end. */
const within = (moment: Date, { from, until }: Between) =>
  moment >= from && moment < until;

/** How many head the Venture had at a moment. */
export const headsAt = (holdings: readonly VentureHolding[], at: Date) =>
  holdings.filter((one) => heldAt(one, at)).length;

/** Her last reading the farm did not doubt inside her stretch with the Venture, before a moment; nothing where the
 *  scale had not read her by then. */
const lastReadingBefore = (one: VentureHolding, at: Date) => {
  const [last] = one.readings
    .filter((reading) => reading.at >= one.from && reading.at < at)
    .toSorted((a, b) => b.at.getTime() - a.at.getTime());
  return last ?? null;
};

/** Her weight going into a stretch, and since when: her last reading before it began, or what she came at. */
const startOf = (
  one: VentureHolding,
  { from }: Between
): { kg: number; at: Date } | null =>
  lastReadingBefore(one, from) ??
  (one.cameKg === null ? null : { kg: one.cameKg, at: one.from });

/**
 * Her part of a stretch as growth reads it: from her weight going into it to her last weight in it — a reading, or her
 * weight at the gate where she went to a buyer in it — over the days between the two. Nothing where she was not weighed
 * in it.
 */
const growingIn = (
  one: VentureHolding,
  between: Between
): GrowthHolding | null => {
  const start = startOf(one, between);
  const ended = one.until !== null && within(one.until, between);
  const until = ended && one.until ? one.until : between.until;
  // Read while she was theirs: a bull bought across mid-month, weighed under his seller that month, was not weighed by them.
  const readings = one.readings.filter(
    (reading) =>
      reading.at >= one.from &&
      reading.at >= between.from &&
      reading.at < between.until &&
      reading.at <= until
  );
  const soldKg = ended && one.wentBy === "sold" ? one.soldKg : null;
  if (!start || (readings.length === 0 && soldKg === null)) {
    return null;
  }
  return {
    takenOn: start.at,
    until,
    cameKg: start.kg,
    soldKg,
    readings,
    chargedMoney: 0,
  };
};

/** A Venture's herd over a stretch, as `herdBetween` tells it. */
export interface HerdBetween {
  atStart: number;
  atEnd: number;
  came: { bought: number; boughtAcross: number };
  went: {
    sold: number;
    soldAcross: number;
    /** Died or culled: both an Animal the Venture's money did not get back on a lorry. */
    died: number;
    lost: number;
  };
  /** The average of each standing one's last reading before the end, and how many it is over: those weighed by then. */
  atEndKg: { averageKg: number; animals: number } | null;
  /** Kilos a day over the stretch, pooled; nothing where none was weighed in it. */
  gainKgPerDay: number | null;
  /** How many were weighed in it, which the gain is read from. */
  weighed: number;
  /** Those that were the Venture's in it and were not weighed in it, by tag. */
  notWeighed: string[];
}

/**
 * A Venture's herd over a stretch — a month — as its own animals tell it: the heads at its start and end, what came
 * (off the lorry, or bought across) and what went (to a buyer, across to another owner, dead or culled, or lost); the
 * herd at the end by each one's last weight before it — never a reading after — and its gain over the stretch, pooled
 * from each one's weight going into it to her last in it, as a Season's is. One not weighed in it is named, never given
 * a figure.
 */
export const herdBetween = (
  holdings: readonly VentureHolding[],
  between: Between
): HerdBetween => {
  const came = holdings.filter((one) => within(one.from, between));
  const went = holdings.filter(
    (one) => one.until !== null && within(one.until, between)
  );
  const wentBy = (...ways: VentureHolding["wentBy"][]) =>
    went.filter((one) => ways.includes(one.wentBy)).length;
  const standing = holdings.filter((one) => heldAt(one, between.until));
  // Over those the scale had read by then, as the herd's progress averages: one never weighed would sit at what she came
  // at and flatten the very growth the figure is there to show.
  const kgs = standing
    .map((one) => lastReadingBefore(one, between.until)?.kg ?? null)
    .filter((kg) => kg !== null);
  // Every Animal that was the Venture's at any moment of the stretch, coming in it or going in it.
  const during = holdings.filter(
    (one) =>
      one.from < between.until &&
      (one.until === null || one.until >= between.from)
  );
  const growing = during.map((one) => ({ one, part: growingIn(one, between) }));
  const growth = growthOf(
    growing.flatMap(({ part }) => (part === null ? [] : [part]))
  );
  return {
    atStart: headsAt(holdings, between.from),
    atEnd: standing.length,
    came: {
      bought: came.filter((one) => one.cameBy === "intake").length,
      boughtAcross: came.filter((one) => one.cameBy === "internal_sale").length,
    },
    went: {
      sold: wentBy("sold"),
      soldAcross: wentBy("internal_sale"),
      /** Died or culled: both an Animal the Venture's money did not get back on a lorry. */
      died: wentBy("died", "culled"),
      lost: wentBy("lost"),
    },
    /** The average of each standing one's last reading before the end, and how many it is over: those weighed by then. */
    atEndKg:
      kgs.length === 0
        ? null
        : {
            averageKg: roundKg(
              kgs.reduce((sum, kg) => sum + kg, 0) / kgs.length
            ),
            animals: kgs.length,
          },
    gainKgPerDay: growth.gainKgPerDay,
    /** How many were weighed in it, which the gain is read from. */
    weighed: growth.weighed,
    /** Those that were the Venture's in it and were not weighed in it, by tag. */
    notWeighed: growing
      .filter(({ part }) => part === null)
      .map(({ one }) => one.tagNumber),
  };
};

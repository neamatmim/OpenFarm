import type { Database } from "@OpenFarm/db";
import type {
  ExpectedGain,
  GainOnRation,
  GainStanding,
  WeightBand,
} from "@OpenFarm/domain";
import {
  EXIT_STATES,
  bandStanding,
  gainCountsFrom,
  gainOnRationOf,
  gainStandingOf,
  isShortOfExpected,
} from "@OpenFarm/domain";

import { bandOf, expectedGainOf, weighedAs } from "./feed-store";

/** A Pen, the Ration it is on, and what that Ration is written to put on the animals that eat it. */
interface PenOnGainingRation {
  penId: string;
  penName: string;
  rationName: string;
  expectedGain: ExpectedGain;
  /** The weights the Ration is written for: its Expected Gain is for the animals inside them. */
  band: WeightBand;
  /** When the Pen was put on this Ration: a bull in it is judged on it from then at the earliest. */
  assignedAt: Date;
}

/** One fattening animal in a Pen whose Ration has an Expected Gain, and what she has gained on it. */
export interface AgainstExpectedGain {
  animalId: string;
  tagNumber: string;
  pen: Omit<PenOnGainingRation, "assignedAt" | "band">;
  /** Her gain on the Ration, or nothing while she has not been on it long enough to say. */
  gain: GainOnRation | null;
  /** Where that stands against the Expected Gain; nothing while there is no gain, or while she weighs outside the
   *  Ration's band. */
  standing: GainStanding | null;
  /** Weighed outside the weights her Ration is written for — too light for it, or grown past it — as feeding and the
   *  band weigh her. Its Expected Gain is not hers to be judged by: moving her is the answer, and the Pens that suit
   *  her are on the list of the animals in the wrong Pen. */
  outsideBand: boolean;
}

/** Every Pen on a Ration in use that has an Expected Gain, by Pen. */
const pensOnGainingRations = async (
  db: Pick<Database, "query">,
  farmId: string
): Promise<Map<string, PenOnGainingRation>> => {
  const rations = await db.query.ration.findMany({
    where: {
      farmId,
      retiredAt: { isNull: true },
      expectedGainLowKg: { isNotNull: true },
      expectedGainHighKg: { isNotNull: true },
    },
    columns: {
      nameBn: true,
      weightFromKg: true,
      weightToKg: true,
      expectedGainLowKg: true,
      expectedGainHighKg: true,
    },
    with: {
      pens: {
        columns: { penId: true, assignedAt: true },
        with: {
          pen: {
            columns: { name: true },
            with: { shed: { columns: { name: true } } },
          },
        },
      },
    },
  });
  const pens = new Map<string, PenOnGainingRation>();
  for (const one of rations) {
    const expectedGain = expectedGainOf(one);
    if (!expectedGain) {
      continue;
    }
    for (const assigned of one.pens) {
      pens.set(assigned.penId, {
        penId: assigned.penId,
        penName: `${assigned.pen.shed.name} / ${assigned.pen.name}`,
        rationName: one.nameBn,
        expectedGain,
        band: bandOf(one),
        assignedAt: assigned.assignedAt,
      });
    }
  }
  return pens;
};

/**
 * Every fattening animal standing in a Pen whose Ration has an Expected Gain, with her gain on that Ration and where it
 * stands against it. Her gain is read off the Weigh-ins the farm did not doubt, over the Farm Parameter's days, and
 * never from before she settled in after she came or before she was standing on this Ration — moved into the Pen, or
 * the Pen put on it — because the Ration she ate before is not this one's to answer for. One weighed outside the
 * Ration's band is not judged by it at all: what it should put on a bull its size is not what it should put on her.
 */
export const againstExpectedGains = async (
  db: Pick<Database, "query">,
  farm: { id: string; gainReadDays: number }
): Promise<AgainstExpectedGain[]> => {
  const pens = await pensOnGainingRations(db, farm.id);
  if (pens.size === 0) {
    return [];
  }
  const animals = await db.query.animal.findMany({
    where: {
      farmId: farm.id,
      side: "fattening",
      state: { notIn: [...EXIT_STATES] },
      penId: { in: [...pens.keys()] },
    },
    orderBy: { tagNumber: "asc" },
    columns: { id: true, tagNumber: true, penId: true },
    with: {
      intake: { columns: { weightKg: true, arrivedAt: true } },
      // The Move that put her in the Pen she stands in: the latest.
      moves: {
        orderBy: { movedAt: "desc", id: "desc" },
        limit: 1,
        columns: { movedAt: true },
      },
      // Newest first, as `weighedAs` reads the one it weighs her by.
      weighIns: {
        where: { flaggedNote: { isNull: true } },
        orderBy: { weighedAt: "desc", id: "desc" },
        columns: { weightKg: true, weighedAt: true },
      },
    },
  });
  return animals.flatMap((one): AgainstExpectedGain[] => {
    const placed = pens.get(one.penId);
    if (!placed) {
      return [];
    }
    const { assignedAt, band, ...pen } = placed;
    const movedIn = one.moves[0]?.movedAt ?? assignedAt;
    const countsFrom = gainCountsFrom({
      arrivedAt: one.intake?.arrivedAt ?? null,
      onRationSince: movedIn > assignedAt ? movedIn : assignedAt,
    });
    const gain = gainOnRationOf(
      one.weighIns.map((reading) => ({
        weightKg: Number(reading.weightKg),
        weighedAt: reading.weighedAt,
      })),
      { readDays: farm.gainReadDays, countsFrom }
    );
    // Weighed as her feed and her band are: the latest reading the farm did not doubt, or what she weighed when she came.
    const { weightKg } = weighedAs(one);
    const outsideBand =
      weightKg !== null && bandStanding(weightKg, band) !== "fits";
    return [
      {
        animalId: one.id,
        tagNumber: one.tagNumber,
        pen,
        gain,
        standing:
          gain && !outsideBand
            ? gainStandingOf(gain.dailyGainKg, pen.expectedGain)
            : null,
        outsideBand,
      },
    ];
  });
};

/** How far under the low end a bull is, as a share of it: the furthest behind first. */
const shortfallOf = ({ gain, pen }: AgainstExpectedGain): number =>
  (gain?.dailyGainKg ?? 0) / pen.expectedGain.lowKg;

/**
 * The fattening animals gaining under what their Pen's Ration is written to put on them, or losing weight: the losing
 * first, because a bull going backwards is ill or not eating, then the furthest under, then by tag.
 */
export const underExpectedGains = async (
  db: Pick<Database, "query">,
  farm: { id: string; gainReadDays: number }
): Promise<AgainstExpectedGain[]> => {
  const all = await againstExpectedGains(db, farm);
  return all
    .filter((one) => one.standing !== null && isShortOfExpected(one.standing))
    .toSorted(
      (a, b) =>
        Number(b.standing === "losing") - Number(a.standing === "losing") ||
        shortfallOf(a) - shortfallOf(b) ||
        a.tagNumber.localeCompare(b.tagNumber)
    );
};

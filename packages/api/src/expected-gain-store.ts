import type { Database } from "@OpenFarm/db";
import type {
  ExpectedGain,
  GainAdjustment,
  GainOnRation,
  GainStanding,
  GainingBand,
  WeightBand,
} from "@OpenFarm/domain";
import {
  EXIT_STATES,
  bandStanding,
  expectedGainFor,
  farmDayOf,
  farmDaysApart,
  grownWeightFor,
  gainCountsFrom,
  gainOnRationOf,
  gainStandingOf,
  isShortOfExpected,
} from "@OpenFarm/domain";

import { hasBand } from "./band-store";
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
  /** Her Pen, its Ration, and the Ration's Expected Gain as it is written — for a crossbred bull. */
  pen: Omit<PenOnGainingRation, "assignedAt" | "band">;
  /** The Expected Gain she is judged against: the Ration's, cut for her being deshi or female. */
  expectedGain: ExpectedGain;
  adjustedFor: GainAdjustment;
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

/** What the farm reads a gain by: over how many days, and the shares a deshi animal and a female are judged at. */
export interface GainReadingFarm {
  id: string;
  gainReadDays: number;
  deshiGainPercent: number;
  femaleGainPercent: number;
}

/**
 * Every fattening animal standing in a Pen whose Ration has an Expected Gain, with her gain on that Ration and where it
 * stands against it. Her gain is read off the Weigh-ins the farm did not doubt, over the Farm Parameter's days, and
 * never from before she settled in after she came or before she was standing on this Ration — moved into the Pen, or
 * the Pen put on it — because the Ration she ate before is not this one's to answer for. One weighed outside the
 * Ration's band is not judged by it at all: what it should put on a bull its size is not what it should put on her.
 * The Ration's figures are a crossbred bull's; a deshi animal, or a cow or heifer, is judged against the farm's share
 * of them, and one nobody wrote a breed for as a cross.
 */
export const againstExpectedGains = async (
  db: Pick<Database, "query">,
  farm: GainReadingFarm
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
    columns: { id: true, tagNumber: true, penId: true, sex: true },
    with: {
      breed: { columns: { deshi: true } },
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
    const { expectedGain, adjustedFor } = expectedGainFor(
      pen.expectedGain,
      { deshi: one.breed?.deshi ?? null, sex: one.sex },
      {
        deshiPercent: farm.deshiGainPercent,
        femalePercent: farm.femaleGainPercent,
      }
    );
    return [
      {
        animalId: one.id,
        tagNumber: one.tagNumber,
        pen,
        expectedGain,
        adjustedFor,
        gain,
        standing:
          gain && !outsideBand
            ? gainStandingOf(gain.dailyGainKg, expectedGain)
            : null,
        outsideBand,
      },
    ];
  });
};

/** How far under the low end of his own range a bull is, as a share of it: the furthest behind first. */
const shortfallOf = ({ gain, expectedGain }: AgainstExpectedGain): number =>
  (gain?.dailyGainKg ?? 0) / expectedGain.lowKg;

/**
 * The fattening animals gaining under what their Pen's Ration is written to put on them, or losing weight: the losing
 * first, because a bull going backwards is ill or not eating, then the furthest under, then by tag.
 */
export const underExpectedGains = async (
  db: Pick<Database, "query">,
  farm: GainReadingFarm
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

/**
 * The farm's Rations in use that say both who they are for and what they should put on them, lightest band first: the
 * ladder a bull climbs as he grows. A Ration with no band, or no Expected Gain, is no rung of it.
 */
export const gainingBandsOf = async (
  db: Pick<Database, "query">,
  farmId: string
): Promise<GainingBand[]> => {
  const rations = await db.query.ration.findMany({
    where: {
      farmId,
      retiredAt: { isNull: true },
      expectedGainLowKg: { isNotNull: true },
      expectedGainHighKg: { isNotNull: true },
    },
    orderBy: { weightFromKg: "asc", nameBn: "asc", id: "asc" },
    columns: {
      weightFromKg: true,
      weightToKg: true,
      expectedGainLowKg: true,
      expectedGainHighKg: true,
    },
  });
  return rations.flatMap((one): GainingBand[] => {
    const band = bandOf(one);
    const expectedGain = expectedGainOf(one);
    return expectedGain && hasBand(band) ? [{ band, expectedGain }] : [];
  });
};

/**
 * What a bull taken in today should weigh when his Target Window opens, low and high: what he weighed when he came,
 * grown at the farm's Rations' Expected Gains for his breed and sex (`grownWeightFor`). The low end is the target he is
 * fed towards unless somebody says otherwise (the Owner's choice, 2026-09-29): a bull gaining what his Rations should
 * give him just makes it, the same line the list of the ones gaining under their Ration draws. Nothing when no Ration
 * on the farm says what a bull his weight should gain.
 */
export const suggestedTargetOf = async (
  db: Pick<Database, "query">,
  farm: GainReadingFarm,
  bull: {
    weightKg: number;
    arrivedAt: Date;
    sex: "male" | "female";
    breedId?: string;
    /** The first day of his Target Window. */
    windowStart: string;
  }
): Promise<{ lowKg: number; highKg: number; days: number } | null> => {
  const [rungs, breed] = await Promise.all([
    gainingBandsOf(db, farm.id),
    bull.breedId
      ? db.query.breed.findFirst({
          where: { id: bull.breedId, farmId: farm.id },
          columns: { deshi: true },
        })
      : null,
  ]);
  const days = farmDaysApart(farmDayOf(bull.arrivedAt), bull.windowStart);
  const grown = grownWeightFor(
    bull.weightKg,
    days,
    rungs,
    { deshi: breed?.deshi ?? null, sex: bull.sex },
    {
      deshiPercent: farm.deshiGainPercent,
      femalePercent: farm.femaleGainPercent,
    }
  );
  return grown ? { ...grown, days } : null;
};

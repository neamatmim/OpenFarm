import type { Database } from "@OpenFarm/db";
import type { BandStanding, WeightBand } from "@OpenFarm/domain";
import { EXIT_STATES, bandStanding } from "@OpenFarm/domain";

import { AS_WEIGHED, bandOf, weighedAs } from "./feed-store";

/** A Pen, and the Ration it is on, as a place a bull could be moved to. */
interface PenOnRation {
  penId: string;
  penName: string;
  rationName: string;
  band: WeightBand;
}

/** A bull the scale says is in the wrong Pen for his size, and the Pens whose Ration his weight fits. */
export interface OutOfBand {
  tagNumber: string;
  weightKg: number;
  weighedAt: Date | null;
  standing: Exclude<BandStanding, "fits">;
  pen: PenOnRation;
  /** Every other Pen on a Ration written for his weight, the first the one to offer. */
  fitsIn: { penId: string; penName: string; rationName: string }[];
}

const hasBand = ({ fromKg, toKg }: WeightBand) =>
  fromKg !== null || toKg !== null;

/** Grown out of it first — he is eating a small bull's share of the trough — then too light, then by tag. */
const STANDING_ORDER = { outgrown: 0, too_light: 1 } as const;

/**
 * The fattening animals standing in a Pen whose Ration has a weight band their weight is outside of: grown past it, or
 * not yet up to it. Weighed as feeding weighs them — the latest Weigh-in the farm did not doubt, or the Intake — so the
 * Pen a bull is told to leave is the one whose trough his weight is fed at. An animal nobody has weighed is left out:
 * there is nothing to say he is in the wrong place.
 */
export const outOfTheirBand = async (
  db: Pick<Database, "query">,
  farmId: string
): Promise<OutOfBand[]> => {
  const rations = await db.query.ration.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    columns: {
      nameBn: true,
      weightFromKg: true,
      weightToKg: true,
    },
    with: {
      pens: {
        columns: { penId: true },
        with: {
          pen: {
            columns: { name: true },
            with: { shed: { columns: { name: true } } },
          },
        },
      },
    },
  });
  const placed: PenOnRation[] = rations.flatMap((one) => {
    const band = bandOf(one);
    return hasBand(band)
      ? one.pens.map((assigned) => ({
          penId: assigned.penId,
          penName: `${assigned.pen.shed.name} / ${assigned.pen.name}`,
          rationName: one.nameBn,
          band,
        }))
      : [];
  });
  if (placed.length === 0) {
    return [];
  }
  const penOf = new Map(placed.map((one) => [one.penId, one]));
  const animals = await db.query.animal.findMany({
    where: {
      farmId,
      side: "fattening",
      state: { notIn: [...EXIT_STATES] },
      penId: { in: [...penOf.keys()] },
    },
    columns: { tagNumber: true, penId: true },
    with: AS_WEIGHED,
  });
  const found = animals.flatMap((one): OutOfBand[] => {
    const pen = penOf.get(one.penId);
    const { weightKg, weighedAt } = weighedAs(one);
    if (!pen || weightKg === null) {
      return [];
    }
    const standing = bandStanding(weightKg, pen.band);
    if (standing === "fits") {
      return [];
    }
    return [
      {
        tagNumber: one.tagNumber,
        weightKg,
        weighedAt,
        standing,
        pen,
        fitsIn: placed
          .filter(
            (other) =>
              other.penId !== pen.penId &&
              bandStanding(weightKg, other.band) === "fits"
          )
          .map(({ penId, penName, rationName }) => ({
            penId,
            penName,
            rationName,
          })),
      },
    ];
  });
  return found.toSorted(
    (a, b) =>
      STANDING_ORDER[a.standing] - STANDING_ORDER[b.standing] ||
      a.tagNumber.localeCompare(b.tagNumber)
  );
};

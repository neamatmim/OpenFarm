import type { FatteningView } from "@OpenFarm/domain";
import { fatteningView, startOfFarmDay } from "@OpenFarm/domain";

/** How the Intake row comes back from the database: money and weights as numeric strings. A joining's may have no
 *  weight — a crossing not priced yet — and then there is no arrival weight to measure gain from, only her window. */
interface IntakeRow {
  weightKg: string | null;
  arrivedAt: Date;
  targetWeightKg: string;
  targetWindowStart: string;
}

/** Her start on the Fattening side as a joining keeps it. */
interface JoiningRow {
  weightKg: string | null;
  joinedAt: Date;
  targetWeightKg: string;
  targetWindowStart: string;
  targetWindowEnd: string;
}

/**
 * Where an animal's time on the Fattening side is read from: the latest of her Intake and the times she joined it other
 * than by Intake — walked across from Dairy, or bought back from a Venture — so her window, what she is fed towards and
 * where her gain starts are the latest arrival's. The same for the board, her page and the Ready suggestion.
 */
export const startOfFattening = <
  T extends IntakeRow & { targetWindowEnd: string },
>(
  intake: T | null | undefined,
  joinings: readonly JoiningRow[] | undefined
): (IntakeRow & { targetWindowEnd: string }) | null => {
  const joined = (joinings ?? []).toSorted(
    (a, b) => b.joinedAt.getTime() - a.joinedAt.getTime()
  )[0];
  if (joined && (!intake || joined.joinedAt > intake.arrivedAt)) {
    return {
      weightKg: joined.weightKg,
      arrivedAt: joined.joinedAt,
      targetWeightKg: joined.targetWeightKg,
      targetWindowStart: joined.targetWindowStart,
      targetWindowEnd: joined.targetWindowEnd,
    };
  }
  return intake ?? null;
};

/**
 * What the scale means for one animal, from the rows the database hands back.
 *
 * One place, because her own page and the Owner's board both ask it and the two had already
 * drifted apart once — the board was reading her *first* twelve readings while her page read her
 * last. Kilogrammes live in numeric columns and come back as strings; they are converted here, at
 * the edge, rather than left to drift as floats in the middle.
 */
export const fatteningOf = (
  intake: IntakeRow | null | undefined,
  /** Her readings in any order; sorted here, because gain is read oldest to newest. */
  weighIns: { weightKg: string; weighedAt: Date }[],
  now: Date
): FatteningView =>
  fatteningView(
    intake && intake.weightKg !== null
      ? {
          weightKg: Number(intake.weightKg),
          arrivedAt: intake.arrivedAt,
          targetWeightKg: Number(intake.targetWeightKg),
        }
      : null,
    weighIns
      .map((reading) => ({
        weightKg: Number(reading.weightKg),
        weighedAt: reading.weighedAt,
      }))
      .toSorted((a, b) => a.weighedAt.getTime() - b.weighedAt.getTime()),
    intake ? startOfFarmDay(intake.targetWindowStart) : null,
    now
  );

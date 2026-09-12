import type { FatteningView } from "@OpenFarm/domain";
import { fatteningView, startOfFarmDay } from "@OpenFarm/domain";

/** How the Intake row comes back from the database: money and weights as numeric strings. */
interface IntakeRow {
  weightKg: string;
  arrivedAt: Date;
  targetWeightKg: string;
  targetWindowStart: string;
}

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
    intake
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

import type { FatteningView } from "@OpenFarm/domain";
import {
  addDays,
  farmDayOf,
  fatteningView,
  startOfFarmDay,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";

/** How the Intake row comes back from the database: money and weights as numeric strings. A joining's may have no
 *  weight — a crossing not priced yet — and then her gain is measured from what the scale said when she crossed. */
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

/** The one joining `startOfFattening` needs of hers, as a relational query reads it: the latest. */
export const LATEST_JOINING = {
  orderBy: { joinedAt: "desc", id: "desc" },
  limit: 1,
  columns: {
    weightKg: true,
    joinedAt: true,
    targetWeightKg: true,
    targetWindowStart: true,
    targetWindowEnd: true,
  },
} as const;

/**
 * Which arrival an animal's time on the Fattening side is read from: her latest joining — walked across from Dairy, or
 * bought back from a Venture — when it is newer than her Intake, else none and the Intake stands. One rule for every
 * reader of her window: the board, her page, the Ready suggestion and the Eid list.
 */
export const joiningInForce = <J extends { joinedAt: Date }>(
  intake: { arrivedAt: Date } | null | undefined,
  joinings: readonly J[] | undefined
): J | null => {
  const [joined] = (joinings ?? []).toSorted(
    (a, b) => b.joinedAt.getTime() - a.joinedAt.getTime()
  );
  return joined && (!intake || joined.joinedAt > intake.arrivedAt)
    ? joined
    : null;
};

/**
 * Where an animal's time on the Fattening side is read from: the latest of her Intake and the times she joined it other
 * than by Intake, so her window, what she is fed towards and where her gain starts are the latest arrival's.
 */
export const startOfFattening = <
  T extends IntakeRow & { targetWindowEnd: string },
>(
  intake: T | null | undefined,
  joinings: readonly JoiningRow[] | undefined
): (IntakeRow & { targetWindowEnd: string }) | null => {
  const joined = joiningInForce(intake, joinings);
  if (joined) {
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
 * The moment a joining's weight is read by: the end of the day she joined, so the morning's round after she was walked
 * over counts. One rule for the price a crossing is set at and for where her gain starts before it is.
 */
export const joiningWeighedBy = (joinedOn: string): Date =>
  startOfFarmDay(addDays(joinedOn, 1));

/** One reading as the database hands it back, with the doubt the farm wrote against it, if any. */
export interface WeighInRow {
  weightKg: string;
  weighedAt: Date;
  flaggedNote: string | null;
}

/** The columns `fatteningOf` reads of a reading: the doubt too, so no caller can forget to pass it. */
export const WEIGH_IN_COLUMNS = {
  weightKg: true,
  weighedAt: true,
  flaggedNote: true,
} as const;

/**
 * How many of her newest readings a gain is read from: back past the farm's longest read days (90) at a weighing every
 * few days, with room for the misweighings it passes over. Every list that reads her gain reads this deep.
 */
export const READINGS_FOR_A_RATE = 30;

/** How far apart two readings must be for this farm to read a gain off them: its own setting. */
export const gainReadDaysOf = async (
  db: Pick<Tx, "query">,
  farmId: string
): Promise<number> => {
  const farm = await db.query.farm.findFirst({
    where: { id: farmId },
    columns: { gainReadDays: true },
  });
  if (!farm) {
    throw new Error(`No farm ${farmId} to read its gains by`);
  }
  return farm.gainReadDays;
};

/** Her readings the farm did not doubt, oldest first, as kilogrammes rather than the strings the database keeps them
 *  as. A misweighing the farm flagged says nothing about what she weighs or gains, as on her Ration's Expected Gain. */
const readingsOf = (weighIns: WeighInRow[]) =>
  weighIns
    .filter((reading) => reading.flaggedNote === null)
    .map((reading) => ({
      weightKg: Number(reading.weightKg),
      weighedAt: reading.weighedAt,
    }))
    .toSorted((a, b) => a.weighedAt.getTime() - b.weighedAt.getTime());

/**
 * What she weighed when she came: the arrival's own weight, or — a crossing nobody has priced — her latest reading by
 * the end of the day she crossed, else her first after. None until the scale has seen her.
 */
const arrivalKg = (
  intake: IntakeRow,
  readings: { weightKg: number; weighedAt: Date }[]
): number | null => {
  if (intake.weightKg !== null) {
    return Number(intake.weightKg);
  }
  const by = joiningWeighedBy(farmDayOf(intake.arrivedAt));
  const that = readings.findLast((one) => one.weighedAt < by);
  return (
    (that ?? readings.find((one) => one.weighedAt >= by))?.weightKg ?? null
  );
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
  weighIns: WeighInRow[],
  now: Date,
  /** How far apart two readings must be for the farm to read a gain off them (`gainReadDaysOf`). */
  readDays: number
): FatteningView => {
  const readings = readingsOf(weighIns);
  const weightKg = intake ? arrivalKg(intake, readings) : null;
  return fatteningView(
    intake && weightKg !== null
      ? {
          weightKg,
          arrivedAt: intake.arrivedAt,
          targetWeightKg: Number(intake.targetWeightKg),
        }
      : null,
    readings,
    intake ? startOfFarmDay(intake.targetWindowStart) : null,
    now,
    readDays
  );
};

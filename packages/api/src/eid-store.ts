import type { Database } from "@OpenFarm/db";
import type { EidWindow, TargetWindow } from "@OpenFarm/domain";
import { EXIT_STATES, nextEidWindow, qurbaniFrom } from "@OpenFarm/domain";

import type { Tx } from "./audit";

type Reader = Pick<Database | Tx, "query">;

/**
 * Every Eid the Farm has written an announced day in for, as the day it was expected on and every day it has been
 * announced for since, latest last. The latest is the one in force.
 */
export const announcementsOf = async (
  db: Reader,
  farmId: string
): Promise<Map<string, string[]>> => {
  const rows = await db.query.eidAnnouncement.findMany({
    where: { farmId },
    columns: { day: true, expectedDay: true },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  const byEid = new Map<string, string[]>();
  for (const row of rows) {
    byEid.set(row.expectedDay, [
      ...(byEid.get(row.expectedDay) ?? []),
      row.day,
    ]);
  }
  return byEid;
};

/** The days in force for every Eid the Farm has had announced. */
export const announcedDays = async (
  db: Reader,
  farmId: string
): Promise<string[]> => {
  const announced = await announcementsOf(db, farmId);
  return [...announced.values()].flatMap((days) => days.at(-1) ?? []);
};

/** The Eid the Farm is feeding towards on `today`, the announced day standing in for the one expected. */
export const farmsNextEid = async (
  db: Reader,
  farmId: string,
  today: string
): Promise<EidWindow | null> =>
  nextEidWindow(today, await announcedDays(db, farmId));

/**
 * The windows an announced Eid was known by before the day now in force — the day expected, and any announced before
 * a correction — which the animals bought meanwhile were aimed at.
 */
export const formerWindowsOf = (
  expectedDay: string,
  days: readonly string[]
): TargetWindow[] => {
  const inForce = days.at(-1);
  return [...new Set([expectedDay, ...days])]
    .filter((day) => day !== inForce)
    .map(qurbaniFrom);
};

/**
 * The Intakes of animals still on the Farm whose Target Window is one of `windows`, split by whose they are: the
 * Farm's own, which the Farm may move, and a Venture's, whose window is the Venture's and moves only by an Amendment.
 * A window somebody typed for another market is none of these, and is left where it is.
 */
export const intakesAimedAt = async (
  db: Reader,
  farmId: string,
  windows: readonly TargetWindow[]
) => {
  if (windows.length === 0) {
    return { own: [], inVentures: 0 };
  }
  const rows = await db.query.intake.findMany({
    where: {
      farmId,
      OR: windows.map((one) => ({
        targetWindowStart: one.start,
        targetWindowEnd: one.end,
      })),
      animal: { state: { notIn: [...EXIT_STATES] } },
    },
    columns: {
      id: true,
      animalId: true,
      targetWindowStart: true,
      targetWindowEnd: true,
    },
    with: { animal: { columns: { ownerVentureId: true } } },
    orderBy: { id: "asc" },
  });
  return {
    own: rows.filter((row) => row.animal.ownerVentureId === null),
    inVentures: rows.filter((row) => row.animal.ownerVentureId !== null).length,
  };
};

import type { Database } from "@OpenFarm/db";
import type { EidWindow, TargetWindow } from "@OpenFarm/domain";
import { EXIT_STATES, nextEidWindow, qurbaniFrom } from "@OpenFarm/domain";

import type { Tx } from "./audit";

type Reader = Pick<Database | Tx, "query">;

/** What the Farm has written in for one Eid: every day it has been announced for, latest last — the latest is the one
 *  in force — and whether that latest row took the announcement back, leaving the Eid on its expected day. */
export interface Announced {
  days: string[];
  withdrawn: boolean;
}

/**
 * Every Eid the Farm has written an announced day in for, by the day it was expected on. A withdrawal is a row whose
 * day is the expected day, so "the latest is in force" holds for it too.
 */
export const announcementsOf = async (
  db: Reader,
  farmId: string
): Promise<Map<string, Announced>> => {
  const rows = await db.query.eidAnnouncement.findMany({
    where: { farmId },
    columns: { day: true, expectedDay: true, withdrawn: true },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  const byEid = new Map<string, Announced>();
  for (const row of rows) {
    byEid.set(row.expectedDay, {
      days: [...(byEid.get(row.expectedDay)?.days ?? []), row.day],
      withdrawn: row.withdrawn,
    });
  }
  return byEid;
};

/** The days in force for every Eid the Farm has announced and not taken back. */
export const announcedDays = async (
  db: Reader,
  farmId: string
): Promise<string[]> => {
  const announced = await announcementsOf(db, farmId);
  return [...announced.values()].flatMap((one) =>
    one.withdrawn ? [] : (one.days.at(-1) ?? [])
  );
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

/** A Target Window as a key, the same for the same three days. */
const windowKey = (window: TargetWindow) => `${window.start}|${window.end}`;

/**
 * How many animals still on the Farm are aimed at each Target Window, the Farm's own apart from a Venture's: read once
 * for a whole list of Eids, rather than asked Eid by Eid.
 */
export const aimedByWindow = async (db: Reader, farmId: string) => {
  const rows = await db.query.intake.findMany({
    where: { farmId, animal: { state: { notIn: [...EXIT_STATES] } } },
    columns: { targetWindowStart: true, targetWindowEnd: true },
    with: { animal: { columns: { ownerVentureId: true } } },
  });
  const counted = new Map<string, { own: number; inVentures: number }>();
  for (const row of rows) {
    const key = windowKey({
      start: row.targetWindowStart,
      end: row.targetWindowEnd,
    });
    const now = counted.get(key) ?? { own: 0, inVentures: 0 };
    counted.set(
      key,
      row.animal.ownerVentureId === null
        ? { ...now, own: now.own + 1 }
        : { ...now, inVentures: now.inVentures + 1 }
    );
  }
  return (windows: readonly TargetWindow[]) => {
    const sum = { own: 0, inVentures: 0 };
    for (const window of windows) {
      const one = counted.get(windowKey(window));
      sum.own += one?.own ?? 0;
      sum.inVentures += one?.inVentures ?? 0;
    }
    return sum;
  };
};

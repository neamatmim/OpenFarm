import type { Database } from "@OpenFarm/db";
import type { EidWindow, TargetWindow } from "@OpenFarm/domain";
import { EXIT_STATES, nextEidWindow, qurbaniFrom } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { joiningInForce } from "./fattening-store";

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

/** Where an animal's Target Window is kept: on her Intake, or on the joining that brought her to the side since. */
export interface AimedRow {
  keptOn: "intake" | "joining";
  id: string;
  animalId: string;
  targetWindowStart: string;
  targetWindowEnd: string;
  ownerVentureId: string | null;
}

/**
 * Every animal still on the Farm that is aimed at a Target Window, at the window she is on now — her latest arrival's,
 * an Intake's or a joining's — and the row that keeps it, so a move of the window moves that row.
 */
const aimedRows = async (db: Reader, farmId: string): Promise<AimedRow[]> => {
  const window = {
    targetWindowStart: true,
    targetWindowEnd: true,
  } as const;
  const rows = await db.query.animal.findMany({
    where: { farmId, state: { notIn: [...EXIT_STATES] } },
    columns: { id: true, ownerVentureId: true },
    with: {
      intake: { columns: { id: true, arrivedAt: true, ...window } },
      joinings: {
        orderBy: { joinedAt: "desc", id: "desc" },
        limit: 1,
        columns: { id: true, joinedAt: true, ...window },
      },
    },
    orderBy: { id: "asc" },
  });
  return rows.flatMap(({ id: animalId, ownerVentureId, intake, joinings }) => {
    const joined = joiningInForce(intake, joinings);
    const kept = joined ?? intake;
    if (!kept) {
      return [];
    }
    return [
      {
        keptOn: joined ? "joining" : "intake",
        id: kept.id,
        animalId,
        targetWindowStart: kept.targetWindowStart,
        targetWindowEnd: kept.targetWindowEnd,
        ownerVentureId,
      },
    ];
  });
};

/** A Target Window as a key, the same for the same three days. */
const windowKey = (window: TargetWindow) => `${window.start}|${window.end}`;

/**
 * The animals still on the Farm whose Target Window is one of `windows`, split by whose they are: the Farm's own, which
 * the Farm may move, and a Venture's, whose window is the Venture's and moves only by an Amendment. A window somebody
 * typed for another market is none of these, and is left where it is.
 */
export const animalsAimedAt = async (
  db: Reader,
  farmId: string,
  windows: readonly TargetWindow[]
) => {
  if (windows.length === 0) {
    return { own: [], inVentures: 0 };
  }
  const keys = new Set(windows.map(windowKey));
  const standing = await aimedRows(db, farmId);
  const rows = standing.filter((row) =>
    keys.has(
      windowKey({ start: row.targetWindowStart, end: row.targetWindowEnd })
    )
  );
  return {
    own: rows.filter((row) => row.ownerVentureId === null),
    inVentures: rows.filter((row) => row.ownerVentureId !== null).length,
  };
};

/**
 * How many animals still on the Farm are aimed at each Target Window, the Farm's own apart from a Venture's: read once
 * for a whole list of Eids, rather than asked Eid by Eid.
 */
export const aimedByWindow = async (db: Reader, farmId: string) => {
  const rows = await aimedRows(db, farmId);
  const counted = new Map<string, { own: number; inVentures: number }>();
  for (const row of rows) {
    const key = windowKey({
      start: row.targetWindowStart,
      end: row.targetWindowEnd,
    });
    const now = counted.get(key) ?? { own: 0, inVentures: 0 };
    counted.set(
      key,
      row.ownerVentureId === null
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

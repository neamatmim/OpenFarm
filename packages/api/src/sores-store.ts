import type { Database } from "@OpenFarm/db";
import { ROUND_WORDS, farmDayOf } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { isOnTheFarm } from "./instances-store";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";

// Several animals in one Pen seen with sores on the mouth or feet within the farm's hours: what FMD looks like before
// the Vet has seen it. Told at once to the Owner and the Manager, naming what was seen and never a disease.

type Db = Pick<Database, "query"> | Tx;

const HOUR_MS = 60 * 60 * 1000;

/** One Pen with enough animals seen with sores in the window, as the notice says it. */
export interface SoresInAPen {
  /** The Pen and the first sighting in the window: what the notice is about, so a Pen is told once however many more
   *  are seen in it, and again only once the window has moved on past that first one. */
  key: string;
  penName: string;
  animals: number;
  since: Date;
}

/**
 * The Pens where at least the farm's number of animals still on the farm were seen with sores within the farm's
 * hours, by where each animal stands now. An Observation taken back does not count, and one animal seen twice is one.
 */
export const soresInPens = async (
  db: Db,
  farm: { id: string; soresTellAnimals: number; soresTellHours: number },
  now: Date
): Promise<SoresInAPen[]> => {
  const seen = await db.query.observation.findMany({
    where: {
      farmId: farm.id,
      saw: ROUND_WORDS.sores,
      withdrawnAt: { isNull: true },
      seenAt: { gte: new Date(now.getTime() - farm.soresTellHours * HOUR_MS) },
    },
    columns: { id: true, animalId: true, seenAt: true },
    with: {
      animal: {
        columns: { penId: true, state: true },
        with: { pen: { columns: { name: true } } },
      },
    },
    orderBy: { seenAt: "asc", id: "asc" },
  });
  const byPen = new Map<
    string,
    { penName: string; first: { id: string; at: Date }; animals: Set<string> }
  >();
  for (const one of seen) {
    if (!isOnTheFarm(one.animal)) {
      continue;
    }
    const pen = byPen.get(one.animal.penId) ?? {
      penName: one.animal.pen.name,
      first: { id: one.id, at: one.seenAt },
      animals: new Set<string>(),
    };
    pen.animals.add(one.animalId);
    byPen.set(one.animal.penId, pen);
  }
  return [...byPen.entries()]
    .filter(([, pen]) => pen.animals.size >= farm.soresTellAnimals)
    .map(([penId, pen]) => ({
      key: `${penId}:${pen.first.id}`,
      penName: pen.penName,
      animals: pen.animals.size,
      since: pen.first.at,
    }));
};

/** The Pens with sores nobody has been told about yet. */
export const soresToTell = async (
  db: Db,
  farm: { id: string; soresTellAnimals: number; soresTellHours: number },
  now: Date
): Promise<SoresInAPen[]> => {
  const pens = await soresInPens(db, farm, now);
  if (pens.length === 0) {
    return [];
  }
  const told = await db.query.alert.findMany({
    where: {
      farmId: farm.id,
      kind: "pen_sores_seen",
      entityId: { in: pens.map((pen) => pen.key) },
    },
    columns: { entityId: true },
  });
  const said = new Set(told.map((row) => row.entityId));
  return pens.filter((pen) => !said.has(pen.key));
};

/** Tells the Owner and the Manager of each Pen. Who hears it is the Notice's to say. */
export const tellOfSores = async (
  tx: Tx,
  farmId: string,
  untold: readonly SoresInAPen[],
  now: Date
): Promise<Raised[]> => {
  const raised: Raised[] = [];
  const remembering = rememberingPeople();
  for (const pen of untold) {
    // Sequential against one unique index, as the other notices are.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await tell(
      tx,
      farmId,
      {
        kind: "pen_sores_seen",
        about: { id: pen.key },
        facts: {
          pen: pen.penName,
          animals: pen.animals,
          since: farmDayOf(pen.since),
        },
      },
      now,
      remembering
    );
    raised.push(...rows);
  }
  return raised;
};

import type { Database } from "@OpenFarm/db";
import type { LastFigureKind, SopContent } from "@OpenFarm/domain";
import { readsAgainstLast } from "@OpenFarm/domain";

/**
 * What each animal gave or weighed the time before, for the sheet to show beside the box and to ask about a figure far
 * from (domain `farFromLast`). For milk, the same milking the time before — a cow's evening is not her morning; for a
 * weighing, her last the farm did not doubt. Never what this very work wrote: a figure put right is not read against
 * itself.
 */

/** How far back the last milking is looked for: a cow not milked in a fortnight has no last worth reading against. */
const MILK_LOOKBACK_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LastFigure {
  figure: number;
  at: Date;
}

/** The first row of each animal's, from rows newest first. */
const firstOfEach = <Row extends { animalId: string }>(
  rows: readonly Row[],
  figureOf: (row: Row) => LastFigure
): Map<string, LastFigure> => {
  const found = new Map<string, LastFigure>();
  for (const row of rows) {
    if (!found.has(row.animalId)) {
      found.set(row.animalId, figureOf(row));
    }
  }
  return found;
};

export const lastFiguresFor = async (
  db: Pick<Database, "query">,
  farmId: string,
  kind: LastFigureKind,
  work: {
    definitionId: string;
    dueAt: Date;
    /** What this work has written already, never read as the time before. */
    completionIds: readonly string[];
  },
  animalIds: readonly string[]
): Promise<Map<string, LastFigure>> => {
  if (animalIds.length === 0) {
    return new Map();
  }
  const notThisWork =
    work.completionIds.length > 0
      ? { completionId: { notIn: [...work.completionIds] } }
      : {};
  if (kind === "milk_record") {
    const rows = await db.query.milkRecord.findMany({
      where: {
        farmId,
        animalId: { in: [...animalIds] },
        ...notThisWork,
        session: {
          instance: {
            definitionId: work.definitionId,
            dueAt: {
              lt: work.dueAt,
              gte: new Date(work.dueAt.getTime() - MILK_LOOKBACK_DAYS * DAY_MS),
            },
          },
        },
      },
      columns: { animalId: true, liters: true, recordedAt: true },
      orderBy: { recordedAt: "desc", id: "desc" },
    });
    return firstOfEach(rows, (row) => ({
      figure: Number(row.liters),
      at: row.recordedAt,
    }));
  }
  const rows = await db.query.weighIn.findMany({
    where: {
      farmId,
      animalId: { in: [...animalIds] },
      flaggedNote: { isNull: true },
      ...notThisWork,
    },
    columns: { animalId: true, weightKg: true, weighedAt: true },
    orderBy: { weighedAt: "desc", id: "desc" },
  });
  return firstOfEach(rows, (row) => ({
    figure: Number(row.weightKg),
    at: row.weighedAt,
  }));
};

/** The last figures for a piece of work's animals, where the Step done at each animal reads a figure against one. */
export const lastFiguresOfWork = async (
  db: Pick<Database, "query">,
  farmId: string,
  work: {
    definitionId: string;
    dueAt: Date;
    content: SopContent;
    completions: readonly { id: string }[];
  },
  animalIds: readonly string[]
): Promise<Map<string, LastFigure>> => {
  const kind = work.content.steps.find((step) => step.repeatPerAnimal)?.effect
    ?.kind;
  if (!readsAgainstLast(kind)) {
    return new Map();
  }
  return await lastFiguresFor(
    db,
    farmId,
    kind,
    {
      definitionId: work.definitionId,
      dueAt: work.dueAt,
      completionIds: work.completions.map((one) => one.id),
    },
    animalIds
  );
};

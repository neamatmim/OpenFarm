import type { Database } from "@OpenFarm/db";
import type { RationLine } from "@OpenFarm/domain";
import { perSessionKg } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { isOnTheFarm } from "./instances-store";

export const linesOf = (value: unknown): RationLine[] =>
  Array.isArray(value) ? (value as RationLine[]) : [];

/**
 * The Ration Version a Pen was on at a given moment. Work raised yesterday is fed on
 * yesterday's Ration even if the Manager changed it this morning — the same rule the Playbook
 * has (ADR 0001), for the same reason: what the farm did has to stay explicable.
 */
export const rationInForceAt = async (
  db: Pick<Database, "query"> | Tx,
  rationId: string,
  at: Date
) => {
  const [version] = await db.query.rationVersion.findMany({
    where: { rationId, publishedAt: { lte: at } },
    orderBy: { publishedAt: "desc", number: "desc" },
    limit: 1,
  });
  return version ?? null;
};

/** The animals a Ration is worked out for: everything standing in the Pen that has not left
 *  the farm. A sold cow keeps her Pen, and feeding for her would be feeding a ghost. */
export const headcountOf = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  penId: string
): Promise<number> => {
  const rows = await db.query.animal.findMany({
    where: { farmId, penId },
    columns: { state: true },
  });
  return rows.filter((row) => isOnTheFarm(row)).length;
};

export interface TargetLine extends RationLine {
  nameBn: string;
  /** What this session calls for, for the animals actually in the Pen. */
  kg: number;
}

/** One session's target per Feed Item, with everything it was worked out from. */
export const targetFor = (
  lines: RationLine[],
  names: Map<string, string>,
  headcount: number,
  sessionsPerDay: number
): TargetLine[] =>
  lines.map((line) => ({
    ...line,
    nameBn: names.get(line.feedItemId) ?? "",
    kg: perSessionKg(line.kgPerAnimalPerDay, headcount, sessionsPerDay),
  }));

/** The farm's Feed Items by id, for putting names on a Ration's figures. */
export const feedNames = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  includeRetired = true
): Promise<Map<string, string>> => {
  const rows = await db.query.feedItem.findMany({
    where: includeRetired ? { farmId } : { farmId, retiredAt: { isNull: true } },
    columns: { id: true, nameBn: true },
  });
  return new Map(rows.map((row) => [row.id, row.nameBn]));
};


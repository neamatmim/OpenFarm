import type { Database } from "@OpenFarm/db";
import type { RationLine } from "@OpenFarm/domain";
import { perSessionKg } from "@OpenFarm/domain";
import { z } from "zod";

import type { Tx } from "./audit";
import { isOnTheFarm } from "./instances-store";

/** A Ration Version's lines as they come back out of jsonb. Parsed rather than asserted:
 *  what the column holds was written by an older version of this code, and trusting it
 *  blindly is how a screen ends up dividing by a string. */
const lineSchema = z.object({
  feedItemId: z.string(),
  kgPerAnimalPerDay: z.number(),
});

export const linesOf = (value: unknown): RationLine[] => {
  const parsed = z.array(lineSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
};

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
export const animalsInPen = async (
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

export interface FeedingTargetLine extends RationLine {
  nameBn: string;
  unit: string;
  /** What this session calls for, for the animals actually standing in the Pen. */
  quantity: number;
}

export interface FeedNamed {
  nameBn: string;
  unit: string;
}

/** One session's Feeding Target per Feed Item, with everything it was worked out from. */
export const feedingTargetFor = (
  ration: { lines: RationLine[]; sessionsPerDay: number },
  feeds: Map<string, FeedNamed>,
  animals: number
): FeedingTargetLine[] =>
  ration.lines.map((line) => ({
    ...line,
    nameBn: feeds.get(line.feedItemId)?.nameBn ?? "",
    unit: feeds.get(line.feedItemId)?.unit ?? "kg",
    quantity: perSessionKg(
      line.kgPerAnimalPerDay,
      animals,
      ration.sessionsPerDay
    ),
  }));

/** The farm's Feed Items by id, for putting names and units on a Ration's figures. */
export const feedsById = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string
): Promise<Map<string, FeedNamed>> => {
  const rows = await db.query.feedItem.findMany({
    where: { farmId },
    columns: { id: true, nameBn: true, unit: true },
  });
  return new Map(rows.map((row) => [row.id, { nameBn: row.nameBn, unit: row.unit }]));
};

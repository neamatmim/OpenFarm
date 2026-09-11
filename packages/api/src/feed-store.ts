import type { Database } from "@OpenFarm/db";
import type { RationLine, SopContent } from "@OpenFarm/domain";
import { perSessionKg, sessionsPerDayOf } from "@OpenFarm/domain";
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
  lines: RationLine[],
  feeds: Map<string, FeedNamed>,
  animals: number,
  sessionsPerDay: number
): FeedingTargetLine[] =>
  lines.map((line) => ({
    ...line,
    nameBn: feeds.get(line.feedItemId)?.nameBn ?? "",
    unit: feeds.get(line.feedItemId)?.unit ?? "kg",
    quantity: perSessionKg(line.kgPerAnimalPerDay, animals, sessionsPerDay),
  }));

/**
 * Everything a Pen's feeding session is worked out from: the Ration Version in force at that
 * moment, the animals standing there, and how often the Playbook feeds them. Null when the
 * Pen is on no Ration, or when nothing in the Playbook feeds it yet — both are things a
 * screen should say rather than dress up as a zero.
 */
export const feedingTargetForPen = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  penId: string,
  /** Which Ration Version to read: the moment the work was raised, or now. */
  rationAsOf: Date,
  /** How often this Pen is fed. Given by work that knows — the Version doing the feeding —
   *  and looked up only for a screen asking about a Pen with no work in front of it. */
  fedTimesADay?: number
): Promise<{
  rationId: string;
  rationVersionId: string;
  name: { bn: string; en: string | null };
  number: number;
  animals: number;
  sessionsPerDay: number;
  items: FeedingTargetLine[];
} | null> => {
  const assigned = await db.query.penRation.findFirst({
    where: { penId, farmId },
    with: { ration: { columns: { id: true, nameBn: true, nameEn: true } } },
  });
  if (!assigned) {
    return null;
  }
  const version = await rationInForceAt(db, assigned.rationId, rationAsOf);
  if (!version) {
    return null;
  }
  const sessionsPerDay =
    fedTimesADay ?? (await sessionsPerDayForPen(db, farmId, penId));
  if (sessionsPerDay === null) {
    return null;
  }
  const animals = await animalsInPen(db, farmId, penId);
  return {
    rationId: assigned.ration.id,
    rationVersionId: version.id,
    name: { bn: assigned.ration.nameBn, en: assigned.ration.nameEn },
    number: version.number,
    animals,
    sessionsPerDay,
    items: feedingTargetFor(
      linesOf(version.items),
      await feedsById(db, farmId),
      animals,
      sessionsPerDay
    ),
  };
};

/**
 * How often the Playbook feeds this Pen: the schedule of the SOP that does the feeding. Said
 * in one place, so a Ration and a schedule cannot disagree about it — if they could, every
 * bucket would be wrong by the ratio between them and the working would still look right.
 *
 * Null when nothing in the Playbook feeds anything yet.
 */
export const sessionsPerDayForPen = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  penId: string
): Promise<number | null> => {
  const definitions = await db.query.sopDefinition.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    orderBy: { createdAt: "asc" },
    with: {
      currentVersion: { columns: { content: true } },
      // The Pen's own feeding work, so a farm with more than one feeding routine answers for
      // the routine that actually feeds this Pen rather than for whichever was written first.
      instances: {
        where: { penId },
        columns: { id: true },
        limit: 1,
      },
    },
  });
  const feeders = definitions.filter((definition) => {
    const content = definition.currentVersion?.content as
      | SopContent
      | undefined;
    return Boolean(
      content?.steps.some((step) => step.effect?.kind === "feeding")
    );
  });
  const mine = feeders.find((definition) => definition.instances.length > 0);
  const chosen = mine ?? feeders[0];
  return chosen
    ? sessionsPerDayOf(chosen.currentVersion?.content as SopContent)
    : null;
};

/** The farm's Feed Items by id, for putting names and units on a Ration's figures. */
export const feedsById = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string
): Promise<Map<string, FeedNamed>> => {
  const rows = await db.query.feedItem.findMany({
    where: { farmId },
    columns: { id: true, nameBn: true, unit: true },
  });
  return new Map(
    rows.map((row) => [row.id, { nameBn: row.nameBn, unit: row.unit }])
  );
};

import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ration, rationVersion } from "@OpenFarm/db/schema/feed";
import type {
  RationLine,
  SopContent,
  WeighedAnimal,
  WeightBand,
} from "@OpenFarm/domain";
import { herdWeightOf, sessionKgOf, sessionsPerDayOf } from "@OpenFarm/domain";
import { z } from "zod";

import type { Tx } from "./audit";
import { isOnTheFarm } from "./instances-store";

/** A Ration Version's lines as they come back out of jsonb. Parsed rather than asserted:
 *  what the column holds was written by an older version of this code, and trusting it
 *  blindly is how a screen ends up dividing by a string. */
const lineSchema = z.union([
  z.object({ feedItemId: z.string(), kgPer100KgPerDay: z.number() }),
  z.object({ feedItemId: z.string(), kgPerAnimalPerDay: z.number() }),
]);

export const linesOf = (value: unknown): RationLine[] => {
  const parsed = z.array(lineSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
};

/** A Ration's weight band as its numeric columns keep it, turned at the edge. */
export const bandOf = (row: {
  weightFromKg: string | null;
  weightToKg: string | null;
}): WeightBand => ({
  fromKg: row.weightFromKg === null ? null : Number(row.weightFromKg),
  toKg: row.weightToKg === null ? null : Number(row.weightToKg),
});

/** A weight band as the numeric columns take it. */
export const bandColumns = ({ fromKg, toKg }: WeightBand) => ({
  weightFromKg: fromKg === null ? null : String(fromKg),
  weightToKg: toKg === null ? null : String(toKg),
});

/**
 * Publishes a Ration's next Version and makes it the one in force: number one for a Ration just made. Never an edit —
 * what a Pen was fed in March can still be shown in June (ADR 0001).
 */
export const publishRationVersion = async (
  tx: Tx,
  {
    farmId,
    rationId,
    items,
    note,
    actorId,
    roleUsed,
    now,
  }: {
    farmId: string;
    rationId: string;
    items: RationLine[];
    note: string | null;
    actorId: string;
    roleUsed: RoleName;
    now: Date;
  }
): Promise<number> => {
  const [previous] = await tx.query.rationVersion.findMany({
    where: { rationId },
    columns: { number: true },
    orderBy: { number: "desc" },
    limit: 1,
  });
  const number = (previous?.number ?? 0) + 1;
  const versionId = uuidv7(now);
  await tx.insert(rationVersion).values({
    id: versionId,
    farmId,
    rationId,
    number,
    items,
    note,
    publishedBy: actorId,
    publishedByRole: roleUsed,
    publishedAt: now,
  });
  await tx
    .update(ration)
    .set({ currentVersionId: versionId })
    .where(eq(ration.id, rationId));
  return number;
};

/**
 * The Ration Version a Pen was on at a given moment. Work raised yesterday is fed on
 * yesterday's Ration even if the Manager changed it this morning — the same rule the Playbook
 * has (ADR 0001), for the same reason: what the farm did has to stay explicable.
 */
const rationInForceAt = async (
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

/**
 * What the scale last said of each Animal, as feeding and her Ration's weight band both read her: her latest Weigh-in
 * the farm did not doubt, or what she weighed at her Intake. A reading flagged as doubtful is kept on her record, but
 * neither the feed nor the band follows it. Asked for with her in one read; `weighedAs` turns the answer.
 */
export const AS_WEIGHED = {
  weighIns: {
    where: { flaggedNote: { isNull: true } },
    columns: { weightKg: true, weighedAt: true },
    orderBy: { weighedAt: "desc", id: "desc" },
    limit: 1,
  },
  intake: { columns: { weightKg: true, arrivedAt: true } },
} as const;

export const weighedAs = (row: {
  weighIns: readonly { weightKg: string; weighedAt: Date }[];
  intake: { weightKg: string | null; arrivedAt: Date } | null;
}): WeighedAnimal => {
  const [latest] = row.weighIns;
  if (latest) {
    return { weightKg: Number(latest.weightKg), weighedAt: latest.weighedAt };
  }
  return row.intake?.weightKg
    ? { weightKg: Number(row.intake.weightKg), weighedAt: row.intake.arrivedAt }
    : { weightKg: null, weighedAt: null };
};

/** The animals a Ration is worked out for: everything standing in the Pen that has not left
 *  the farm, each as the scale last said. A sold cow keeps her Pen, and feeding for her would be feeding a ghost. */
const animalsInPen = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  penId: string
): Promise<WeighedAnimal[]> => {
  const rows = await db.query.animal.findMany({
    where: { farmId, penId },
    columns: { state: true },
    with: AS_WEIGHED,
  });
  return rows.filter((row) => isOnTheFarm(row)).map(weighedAs);
};

/** One line of what a Pen is owed. Exported because it is the shape `feedingTargetForPen` answers
 *  with, and the routers' own types are written in terms of it, though nobody names it. */
export type FeedingTargetLine = RationLine & {
  nameBn: string;
  unit: string;
  /** What this session calls for, for the animals actually standing in the Pen and what they weigh; nothing for a
   *  line by weight in a Pen nobody has weighed. */
  quantity: number | null;
};

interface FeedNamed {
  nameBn: string;
  unit: string;
}

/** One session's Feeding Target per Feed Item, with everything it was worked out from. */
const feedingTargetFor = (
  lines: RationLine[],
  feeds: Map<string, FeedNamed>,
  herd: { animals: number; weightKg: number | null },
  sessionsPerDay: number
): FeedingTargetLine[] =>
  lines.map((line) => ({
    ...line,
    nameBn: feeds.get(line.feedItemId)?.nameBn ?? "",
    unit: feeds.get(line.feedItemId)?.unit ?? "kg",
    quantity: sessionKgOf(line, herd, sessionsPerDay),
  }));

/**
 * How often the Playbook feeds this Pen: the schedule of the SOP that does the feeding. Said
 * in one place, so a Ration and a schedule cannot disagree about it — if they could, every
 * bucket would be wrong by the ratio between them and the working would still look right.
 *
 * Null when nothing in the Playbook feeds anything yet.
 */
const sessionsPerDayForPen = async (
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
const feedsById = async (
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

/**
 * What a Pen is owed at one feeding, and what each line of it is called.
 *
 * The one way in, with the Ration in force on the day, the animals standing in the Pen, the Playbook's
 * sessions and the Feed Items' names all worked out behind it. Those were exported once and nothing
 * outside this file ever asked for them: an interface of seven where two were wanted, and five ways to
 * get half an answer.
 *
 * Null when the Pen is on no Ration, or when nothing in the Playbook feeds it yet — both are things a screen should
 * say rather than dress up as a zero.
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
  /** What the Pen weighs as the Ration by weight is fed on, and how that was known. */
  herd: ReturnType<typeof herdWeightOf>;
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
  const standing = await animalsInPen(db, farmId, penId);
  const animals = standing.length;
  const herd = herdWeightOf(standing);
  return {
    rationId: assigned.ration.id,
    rationVersionId: version.id,
    name: { bn: assigned.ration.nameBn, en: assigned.ration.nameEn },
    number: version.number,
    animals,
    herd,
    sessionsPerDay,
    items: feedingTargetFor(
      linesOf(version.items),
      await feedsById(db, farmId),
      { animals, weightKg: herd.weightKg },
      sessionsPerDay
    ),
  };
};

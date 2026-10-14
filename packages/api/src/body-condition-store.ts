import type { Database } from "@OpenFarm/db";
import { sql } from "@OpenFarm/db/operators";
import type { sopVersion } from "@OpenFarm/db/schema/sop";
import type { Bilingual, BodyConditionScore } from "@OpenFarm/domain";
import { bodyConditionIn, bodyConditionSlot } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { contentOf } from "./sop-content";

type Db = Pick<Database, "query"> | Tx;

/** One judgment of her Body Condition: the score, when she was judged, and the procedure that asked it. */
export interface BodyConditionReading {
  score: BodyConditionScore;
  judgedAt: Date;
  procedure: Bilingual;
}

/** How many of her readings her page shows: enough to see her going up or down. */
export const BODY_CONDITION_SHOWN = 6;

/** A Version that offers a choice worth "5" somewhere: the database's cheap first sieve, before each Step is read. */
const mayAskBodyCondition = (table: typeof sopVersion) =>
  sql`jsonb_path_exists(${table.content}, '$.steps[*].evidence[*].choices[*] ? (@.value == "5")')`;

/**
 * Every Body Condition the farm judged of these animals, the latest first, read from the Steps that asked it: any Step of
 * any Version that asks it on the five-point scale, so a score judged before a procedure was reworded or republished is
 * read as well as one judged today. A Step skipped, or answered with no score, judged nothing. A Correction rewrites
 * the Step's answer, so what is read is what the Step holds now.
 */
export const bodyConditionsOf = async (
  db: Db,
  farmId: string,
  animalIds: readonly string[],
  perAnimal?: number
): Promise<Map<string, BodyConditionReading[]>> => {
  const readings = new Map<string, BodyConditionReading[]>();
  if (animalIds.length === 0) {
    return readings;
  }
  const versions = await db.query.sopVersion.findMany({
    where: { farmId, RAW: mayAskBodyCondition },
    columns: { id: true, content: true },
  });
  // Which Steps of which Version ask it, and what the procedure was called then.
  const asking = new Map(
    versions.flatMap((version) => {
      const content = contentOf(version);
      const steps = new Map(
        content.steps
          .filter((step) => bodyConditionSlot(step) !== -1)
          .map((step) => [step.id, step])
      );
      return steps.size > 0
        ? [[version.id, { name: content.name, steps }] as const]
        : [];
    })
  );
  if (asking.size === 0) {
    return readings;
  }
  const done = await db.query.stepCompletion.findMany({
    where: {
      farmId,
      animalId: { in: [...animalIds] },
      status: "done",
      instance: { versionId: { in: [...asking.keys()] } },
    },
    columns: {
      animalId: true,
      stepId: true,
      evidence: true,
      recordedAt: true,
    },
    with: { instance: { columns: { versionId: true } } },
    orderBy: { recordedAt: "desc", id: "desc" },
  });
  for (const one of done) {
    const version = asking.get(one.instance.versionId);
    const step = version?.steps.get(one.stepId);
    const score =
      step && Array.isArray(one.evidence)
        ? bodyConditionIn(step, one.evidence)
        : null;
    if (!(version && score !== null && one.animalId)) {
      continue;
    }
    const hers = readings.get(one.animalId) ?? [];
    if (perAnimal === undefined || hers.length < perAnimal) {
      hers.push({
        score,
        judgedAt: one.recordedAt,
        procedure: version.name,
      });
    }
    readings.set(one.animalId, hers);
  }
  return readings;
};

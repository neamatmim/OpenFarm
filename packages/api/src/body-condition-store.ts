import type { Database } from "@OpenFarm/db";
import { sql } from "@OpenFarm/db/operators";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { stepCompletion } from "@OpenFarm/db/schema/instance";
import type { sopVersion } from "@OpenFarm/db/schema/sop";
import type { Bilingual, BodyConditionScore, Step } from "@OpenFarm/domain";
import {
  BODY_CONDITION_SCORES,
  asksBodyConditionIn,
  bodyConditionIn,
  bodyConditionSlot,
  judgedAtOf,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { contentOf } from "./sop-content";

type Db = Pick<Database, "query"> | Tx;

/** One judgment of her Body Condition: the score, when she was judged, and the procedure that asked it. */
export interface BodyConditionReading {
  score: BodyConditionScore;
  judgedAt: Date;
  procedure: Bilingual;
}

/** Her latest Body Condition and when she was judged: what a list of animals says beside each. */
export type LatestBodyCondition = Pick<
  BodyConditionReading,
  "score" | "judgedAt"
>;

/** How many of her readings her page shows: enough to see her going up or down. */
export const BODY_CONDITION_SHOWN = 6;

/** A Version offering a choice worth "5" somewhere: the database's cheap first sieve, before each Step is read. */
const offersAFive = (table: typeof sopVersion) =>
  sql`jsonb_path_exists(${table.content}, '$.steps[*].evidence[*].choices[*] ? (@.value == "5")')`;

/** One Step of one Version that asks it, and where. */
interface Asking {
  versionId: string;
  step: Step;
  slot: number;
  name: Bilingual;
}

/** Every Step of the farm's Versions that asks Body Condition, by Version and Step. */
const stepsAskingIt = async (db: Db, farmId: string): Promise<Asking[]> => {
  const versions = await db.query.sopVersion.findMany({
    where: { farmId, RAW: offersAFive },
    columns: { id: true, content: true },
  });
  return versions.flatMap((version) => {
    const content = contentOf(version);
    return content.steps.filter(asksBodyConditionIn).map((step) => ({
      versionId: version.id,
      step,
      slot: bodyConditionSlot(step),
      name: content.name,
    }));
  });
};

/** The Step of one Version that asked it, its score in its own slot: a done Step that judged her. */
const judgedBy =
  (asking: readonly Asking[]) => (table: typeof stepCompletion) => {
    const scores = sql.join(
      BODY_CONDITION_SCORES.map((score) => sql`${score}`),
      sql`, `
    );
    const any = sql.join(
      asking.map(
        (one) =>
          sql`(${sopInstance.versionId} = ${one.versionId} and ${table.stepId} = ${one.step.id} and ${table.evidence} ->> ${sql.raw(String(one.slot))} in (${scores}))`
      ),
      sql` or `
    );
    return sql`exists (select 1 from ${sopInstance} where ${sopInstance.id} = ${table.instanceId} and (${any}))`;
  };

/**
 * The Body Condition the farm judged of each of these animals — the `perAnimal` latest of each, newest first — read from
 * the Steps that asked it: any Step of any Version that asks it, so a score judged before a procedure was reworded or
 * republished is read as well as one judged today. A Step skipped, or answered with no score, judged nothing; a
 * Correction rewrites the Step's answer, so what is read is what the Step holds now. The database picks each animal's
 * latest by when they were written, the id breaking a tie; each is then dated when she was judged — when she calved,
 * for a Calving written up later.
 */
export const bodyConditionsOf = async (
  db: Db,
  farmId: string,
  animalIds: readonly string[],
  perAnimal: number
): Promise<Map<string, BodyConditionReading[]>> => {
  const readings = new Map<string, BodyConditionReading[]>();
  if (animalIds.length === 0) {
    return readings;
  }
  const asking = await stepsAskingIt(db, farmId);
  if (asking.length === 0) {
    return readings;
  }
  const byVersionStep = new Map(
    asking.map((one) => [`${one.versionId}\u0000${one.step.id}`, one])
  );
  const animals = await db.query.animal.findMany({
    where: { farmId, id: { in: [...animalIds] } },
    columns: { id: true },
    with: {
      stepCompletions: {
        where: { status: "done", RAW: judgedBy(asking) },
        columns: { stepId: true, evidence: true, recordedAt: true },
        with: { instance: { columns: { versionId: true } } },
        orderBy: { recordedAt: "desc", id: "desc" },
        limit: perAnimal,
      },
    },
  });
  for (const her of animals) {
    const hers = her.stepCompletions.flatMap((done) => {
      const asked = byVersionStep.get(
        `${done.instance.versionId}\u0000${done.stepId}`
      );
      const evidence = Array.isArray(done.evidence) ? done.evidence : [];
      const score = asked ? bodyConditionIn(asked.step, evidence) : null;
      return asked && score !== null
        ? [
            {
              score,
              judgedAt: judgedAtOf(asked.step, evidence, done.recordedAt),
              procedure: asked.name,
            },
          ]
        : [];
    });
    if (hers.length > 0) {
      readings.set(
        her.id,
        hers.toSorted((a, b) => b.judgedAt.getTime() - a.judgedAt.getTime())
      );
    }
  }
  return readings;
};

/** Each animal's latest Body Condition and when she was judged, for a list that says it beside her. */
export const latestBodyConditions = async (
  db: Db,
  farmId: string,
  animalIds: readonly string[]
): Promise<Map<string, LatestBodyCondition>> => {
  const readings = await bodyConditionsOf(db, farmId, animalIds, 1);
  return new Map(
    [...readings].flatMap(([animalId, [latest]]) =>
      latest
        ? [[animalId, { score: latest.score, judgedAt: latest.judgedAt }]]
        : []
    )
  );
};

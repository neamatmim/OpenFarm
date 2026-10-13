import type { Database } from "@OpenFarm/db";
import type { Bilingual } from "@OpenFarm/domain";
import { choiceSaid } from "@OpenFarm/domain";

import { causeOf, heatKeyOf, unwellKeyOf } from "./work-cause";

/**
 * What became of an Observation, in a word: the work it raised still owed, done, not done in time or no longer wanted —
 * or the Vet saw her, which answers it whatever became of the work.
 */
export type OutcomeState =
  | "open"
  | "done"
  | "missed"
  | "called_off"
  | "diagnosed";

/** What became of one Observation: the work it raised and how that stands, what was done, and what the Vet made of it. */
export interface Outcome {
  /** The work it raised; none where it raised none — a cow the Vet diagnosed before the day raised any. */
  instanceId: string | null;
  state: OutcomeState;
  /** What the work's answer said was done — "The Vet has been called" — as its Version said it. */
  said: Bilingual | null;
  /** When the work was done, for work that is. */
  doneAt: Date | null;
  /** What the Vet's Diagnosis named, where one answered it. */
  diagnosis: Bilingual | null;
}

const STATE_OF: Record<string, OutcomeState> = {
  due: "open",
  in_progress: "open",
  sent_back: "open",
  completed: "done",
  approved: "done",
  missed: "missed",
  called_off: "called_off",
};

/** The causes an Observation's own work carries, raised the day it was seen: an unwell animal's, or a heat's. */
const causesOf = (observationId: string) => [
  causeOf(unwellKeyOf(observationId), 0),
  causeOf(heatKeyOf(observationId), 0),
];

/** The first choice answered on the work, in the order it was recorded, as its own Version labels it. */
const answerSaid = (work: {
  version: { content: unknown };
  completions: { stepId: string; evidence: unknown; status: string }[];
}): Bilingual | null => {
  for (const done of work.completions) {
    if (done.status !== "done" || !Array.isArray(done.evidence)) {
      continue;
    }
    for (const [slot, value] of done.evidence.entries()) {
      const said = choiceSaid(
        work.version.content as Parameters<typeof choiceSaid>[0],
        done.stepId,
        slot,
        value
      );
      if (said) {
        return said;
      }
    }
  }
  return null;
};

/**
 * What became of each of these Observations: the work it raised, found by its exact cause about her as her page finds a
 * heat's, how that work stands and what its answer said; and the Vet's Diagnosis where one answered it, which says what
 * she had whether the work was called off by it or never raised. An Observation that raised nothing and that no Vet
 * answered has no outcome.
 */
export const outcomesOf = async (
  db: Pick<Database, "query">,
  farmId: string,
  observations: readonly { id: string; animalId: string }[]
): Promise<Map<string, Outcome>> => {
  const outcomes = new Map<string, Outcome>();
  if (observations.length === 0) {
    return outcomes;
  }
  const ids = observations.map((one) => one.id);
  const byCause = new Map(
    observations.flatMap((one) =>
      causesOf(one.id).map((cause) => [cause, one.id])
    )
  );
  const [raised, diagnosed] = await Promise.all([
    db.query.sopInstance.findMany({
      where: {
        farmId,
        animalId: { in: [...new Set(observations.map((one) => one.animalId))] },
        cause: { in: [...byCause.keys()] },
      },
      orderBy: { id: "asc" },
      columns: { id: true, cause: true, state: true, completedAt: true },
      with: {
        version: { columns: { content: true } },
        completions: {
          orderBy: { recordedAt: "asc", id: "asc" },
          columns: { stepId: true, evidence: true, status: true },
        },
      },
    }),
    db.query.diagnosis.findMany({
      where: { farmId, observationId: { in: ids } },
      orderBy: { diagnosedAt: "asc", id: "asc" },
      columns: { observationId: true, disease: true, diseaseEn: true },
    }),
  ]);
  for (const work of raised) {
    const seen = work.cause ? byCause.get(work.cause) : undefined;
    if (!seen || outcomes.has(seen)) {
      continue;
    }
    outcomes.set(seen, {
      instanceId: work.id,
      state: STATE_OF[work.state] ?? "open",
      said: answerSaid(work),
      doneAt: work.completedAt,
      diagnosis: null,
    });
  }
  const answered = new Set<string>();
  for (const vet of diagnosed) {
    if (!vet.observationId || answered.has(vet.observationId)) {
      continue;
    }
    answered.add(vet.observationId);
    const work = outcomes.get(vet.observationId);
    outcomes.set(vet.observationId, {
      instanceId: work?.instanceId ?? null,
      state: "diagnosed",
      said: null,
      doneAt: work?.doneAt ?? null,
      diagnosis: vet.diseaseEn
        ? { bn: vet.disease, en: vet.diseaseEn }
        : { bn: vet.disease },
    });
  }
  return outcomes;
};

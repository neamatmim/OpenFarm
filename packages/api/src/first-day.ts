import type { Database } from "@OpenFarm/db";
import type { Evidence } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { contentOf } from "./sop-content";

type Db = Pick<Database, "query"> | Tx;

/** How long after her birth what was done to her counts as her first day: the day itself, and the night after it for
 *  work written up late. */
const FIRST_DAY_MS = 36 * 60 * 60 * 1000;

interface Bilingual {
  bn: string;
  en?: string;
}

/** What one Step recorded of her, as her page says it. */
type Answer =
  | { kind: "number"; value: number; unit: Bilingual | null }
  | { kind: "choice"; label: Bilingual }
  | { kind: "tick" };

/** One Step done to her in her first day — the colostrum, the navel, her weight — or skipped, and why. */
export interface FirstDayLine {
  at: Date;
  procedure: Bilingual;
  step: Bilingual;
  answers: Answer[];
  skipReason: string | null;
}

/** What a Step's Evidence slot recorded, said as the Version said it: the unit of a number, the label of a choice. */
const answerOf = (evidence: Evidence, value: unknown): Answer | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (evidence.type === "number" && typeof value === "number") {
    return { kind: "number", value, unit: evidence.unit ?? null };
  }
  if (evidence.type === "choice") {
    const chosen = evidence.choices?.find((one) => one.value === value);
    return chosen ? { kind: "choice", label: chosen.label } : null;
  }
  if (evidence.type === "tick" && value === true) {
    return { kind: "tick" };
  }
  return null;
};

/**
 * Her first day, for a calf born here: every Step of work raised about her in the hours after her birth, oldest first —
 * her first colostrum and how much, her navel, her weight — read from the Step Completions themselves, since the
 * liters are kept nowhere else. Only her own work: a round of the whole Pen passes over her too ("not calved yet"), and
 * that says nothing about her first day. Nothing for an animal the farm did not see born.
 */
export const herFirstDay = async (
  db: Db,
  farmId: string,
  her: { id: string; source: string; birthDate: Date | null }
): Promise<FirstDayLine[]> => {
  if (her.source !== "born" || !her.birthDate) {
    return [];
  }
  const from = her.birthDate;
  const until = new Date(from.getTime() + FIRST_DAY_MS);
  const done = await db.query.stepCompletion.findMany({
    where: {
      farmId,
      animalId: her.id,
      recordedAt: { gte: from, lt: until },
    },
    columns: {
      stepId: true,
      evidence: true,
      skipReason: true,
      recordedAt: true,
    },
    with: {
      instance: {
        columns: { animalId: true },
        with: { version: { columns: { content: true } } },
      },
    },
    orderBy: { recordedAt: "asc", id: "asc" },
  });
  return done.flatMap((one) => {
    if (one.instance.animalId !== her.id) {
      return [];
    }
    const content = contentOf(one.instance.version);
    const step = content.steps.find((candidate) => candidate.id === one.stepId);
    if (!step) {
      return [];
    }
    const values = Array.isArray(one.evidence) ? one.evidence : [];
    return [
      {
        at: one.recordedAt,
        procedure: content.name,
        step: step.text,
        answers: step.evidence.flatMap((evidence, index) => {
          const answer = answerOf(evidence, values[index]);
          return answer ? [answer] : [];
        }),
        skipReason: one.skipReason,
      },
    ];
  });
};

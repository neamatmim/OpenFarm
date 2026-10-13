import type { Database } from "@OpenFarm/db";
import { and, inArray, like, or, sql } from "@OpenFarm/db/operators";
import type { Bilingual } from "@OpenFarm/domain";
import { choiceSaid } from "@OpenFarm/domain";

import { heatThatRaised, unwellThatRaised } from "./work-cause";

/** What became of a sighting's work, in four words: still owed, done, not done in time, or no longer wanted. */
export type OutcomeState = "open" | "done" | "missed" | "called_off";

/** What became of one sighting: the work it raised, how that stands, and — once answered — what was done. */
export interface Outcome {
  instanceId: string;
  state: OutcomeState;
  /** What the work's answer said was done — "The Vet has been called" — as its Version said it. */
  said: Bilingual | null;
  /** When it was done, for work that is. */
  doneAt: Date | null;
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

/** The Observation a piece of work was raised by, read off its cause: the first raising only, never one raised again. */
const sightingThatRaised = (cause: string | null): string | null =>
  unwellThatRaised(cause) ?? heatThatRaised(cause);

/** The first choice answered on the work, as its own Version labels it: what was done about her. */
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
 * What became of each of these sightings: the work an unwell animal or a heat raised, how it stands, and what its first
 * chosen answer said. Read from the work's own cause (`unwell:<id>:+n`, `heat:<id>:+n`), which is where a sighting is
 * tied to what it raised. A sighting that raised nothing has no outcome.
 */
export const outcomesOf = async (
  db: Database,
  farmId: string,
  observationIds: readonly string[]
): Promise<Map<string, Outcome>> => {
  const outcomes = new Map<string, Outcome>();
  if (observationIds.length === 0) {
    return outcomes;
  }
  const raised = await db.query.sopInstance.findMany({
    where: {
      farmId,
      // `<happening>:<observation id>:+<days>`, and only the two happenings a sighting raises work by.
      RAW: (row) =>
        and(
          or(like(row.cause, "unwell:%"), like(row.cause, "heat:%")),
          inArray(sql`split_part(${row.cause}, ':', 2)`, [...observationIds])
        ) ?? sql`false`,
    },
    // The first raised first, so a sighting's own work is the one said.
    orderBy: { id: "asc" },
    columns: { id: true, cause: true, state: true, completedAt: true },
    with: {
      version: { columns: { content: true } },
      completions: {
        columns: { stepId: true, evidence: true, status: true },
      },
    },
  });
  for (const work of raised) {
    const seen = sightingThatRaised(work.cause);
    if (!seen || outcomes.has(seen)) {
      continue;
    }
    outcomes.set(seen, {
      instanceId: work.id,
      state: STATE_OF[work.state] ?? "open",
      said: answerSaid(work),
      doneAt: work.completedAt,
    });
  }
  return outcomes;
};

import { scratchDb } from "@OpenFarm/test-harness";
import type { RouterClient } from "@orpc/server";

import type { StepAnswer } from "../entries/step-completion";
import type { appRouter } from "../routers/index";

type Client = Pick<RouterClient<typeof appRouter>, "instances">;

/**
 * Puts a Step right as the work screen does: the answer it was shown — the Completion as the farm holds it — beside
 * the answer it should hold now. For tests about what a corrected Step does; what a stale one is told is the
 * Correction's own test.
 */
export const correctStepAsShown = async (
  client: Client,
  {
    completionId,
    reason,
    feeding,
    counts,
    renewal,
    ...answer
  }: Partial<StepAnswer> & { completionId: string; reason: string }
) => {
  const recorded = await scratchDb().query.stepCompletion.findFirst({
    where: { id: completionId },
    columns: {
      skipReason: true,
      evidence: true,
      destination: true,
      outOfRange: true,
    },
  });
  return client.instances.correctStep({
    id: completionId,
    reason,
    changes: {
      answer: {
        from: {
          skipReason: recorded?.skipReason ?? null,
          evidence: (recorded?.evidence ?? []) as StepAnswer["evidence"],
          destination: recorded?.destination ?? null,
          outOfRange: recorded?.outOfRange ?? null,
        },
        to: { ...answer, evidence: answer.evidence ?? [] },
      },
    },
    feeding,
    counts,
    renewal,
  });
};

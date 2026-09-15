import { scratchDb } from "@OpenFarm/test-harness";
import type { RouterClient } from "@orpc/server";

import type { Tx } from "../audit";
import { stepOf } from "../completion-store";
import { factsAsShown, recordedFactsOf } from "../effects/effect";
import type { StepAnswer } from "../entries/step-completion";
import type { appRouter } from "../routers/index";
import { contentOf } from "../sop-content";

type Client = Pick<RouterClient<typeof appRouter>, "instances">;

/**
 * Puts a Step right as the work screen does: the answer it was shown — the Completion as the farm holds it, and what its
 * Effect recorded beside it — beside the answer it should hold now. For tests about what a corrected Step does; what a
 * stale one is told is the Correction's own test.
 */
export const correctStepAsShown = async (
  client: Client,
  {
    completionId,
    reason,
    ...answer
  }: Partial<StepAnswer> & { completionId: string; reason: string }
) => {
  const recorded = await scratchDb().query.stepCompletion.findFirst({
    where: { id: completionId },
    columns: {
      stepId: true,
      skipReason: true,
      evidence: true,
      destination: true,
      outOfRange: true,
    },
    with: { instance: { with: { version: { columns: { content: true } } } } },
  });
  const facts = recorded?.instance
    ? factsAsShown(
        await recordedFactsOf(
          scratchDb() as unknown as Tx,
          stepOf(contentOf(recorded.instance.version), recorded.stepId),
          completionId
        )
      )
    : {};
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
          ...facts,
        },
        to: { ...answer, evidence: answer.evidence ?? [] },
      },
    },
  });
};

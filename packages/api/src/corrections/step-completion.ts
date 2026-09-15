import type { RoleName } from "@OpenFarm/db/schema/farm";
import { stepCompletion } from "@OpenFarm/db/schema/instance";
import { MILK_DESTINATIONS, isClinicalStep } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { stepOf } from "../completion-store";
import type { EffectResult } from "../effects";
import {
  evidenceValue,
  readCompletion,
  replaceStep,
  stepCompletionInput,
} from "../entries/step-completion";
import { alertParams } from "../instances-store";
import { requireWorkInScope } from "../scope";
import { contentOf } from "../sop-content";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

const loadStep = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.stepCompletion.findFirst({
    where: { id, farmId },
    with: {
      // With its Pen, because a Needs Review raised about it has to say which work it is about.
      instance: {
        with: {
          version: { columns: { content: true } },
          pen: {
            columns: { name: true },
            with: { shed: { columns: { name: true } } },
          },
        },
      },
    },
  });
  if (row && !row.instance) {
    throw new ORPCError("NOT_FOUND");
  }
  return row as
    | (typeof row & {
        instance: NonNullable<NonNullable<typeof row>["instance"]>;
      })
    | undefined;
};

/** A Step's answer as the work screen shows it: the Evidence, the skip, where the milk went, the warning gone past. */
const answerShown = z.object({
  // Trimmed, as the farm keeps it: a screen still showing what a phone held before it was sent may not have been.
  skipReason: z.string().trim().nullable(),
  evidence: z.array(evidenceValue),
  destination: z.enum(MILK_DESTINATIONS).nullable(),
  outOfRange: z.string().nullable(),
});

/**
 * What putting a Step right may change: its answer, in full — and what was fed, counted or renewed, which the Step's
 * Effect keeps rather than the Completion, and which is taken as it comes.
 */
export const stepCorrectionInput = correctionInput({
  answer: changeOf(
    stepCompletionInput.pick({
      evidence: true,
      destination: true,
      outOfRange: true,
      skipReason: true,
    }),
    answerShown
  ),
}).extend(
  stepCompletionInput.pick({ feeding: true, counts: true, renewal: true }).shape
);

type Input = z.infer<typeof stepCorrectionInput>;

/** What the work screen is told once a Step is put right. */
interface StepCorrected {
  roleUsed: RoleName;
  effect: EffectResult;
  needsReview: boolean;
}

/**
 * A Step Completion put right, and its Effect with it — keyed on the same Completion, so a corrected litres figure
 * replaces its Milk Record and the Session's reconciliation is worked out afresh. The Completion holds the current
 * truth; every answer it has held is in its history.
 */
export const stepCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadStep>>>,
  Input["changes"],
  StepCorrected,
  Pick<Input, "feeding" | "counts" | "renewal">
> = {
  entity: "step_completion",
  table: stepCompletion,
  roles: ["owner", "manager", "staff", "vet"],
  visitingVet: true,
  missing: "No such step",
  load: loadStep,
  entry: (row) => ({
    // The farm's clock, not the phone's: a Correction Window measured on a device's own time would be a window the
    // device could widen.
    enteredAt: row.receivedAt,
    enteredBy: row.recordedBy,
    // A Pregnancy Check is a clinical finding, and the Vet's window over the clinical record is the one that lets a Vet
    // put their own finding right.
    isHealthEntry: isClinicalStep(
      stepOf(contentOf(row.instance.version), row.stepId)
    ),
  }),
  requireInScope: (scope, row) => requireWorkInScope(scope, row.instance),
  shown: (_tx, row) =>
    Promise.resolve({
      answer: {
        skipReason: row.skipReason,
        evidence: row.evidence as z.infer<typeof evidenceValue>[],
        destination: row.destination,
        outOfRange: row.outOfRange,
      },
    }),
  shownAs: {
    answer: (to) => ({
      skipReason: to.skipReason ?? null,
      evidence: to.evidence,
      destination: to.destination ?? null,
      outOfRange: to.outOfRange ?? null,
    }),
  },
  // Taken as a change whenever they come: the work screen sends a feeding Step's lines every time, and the Effect run
  // again on the same lines writes what it wrote before.
  changesBeyondValues: ({ feeding, counts, renewal }) =>
    Boolean(feeding ?? counts ?? renewal),
  trail: async (tx, row, outcome) => {
    const completion = await readCompletion(tx, row.id);
    // With what the Effect decided, as a completion's own entry has: a corrected day that moved the calving work has to
    // say which work went where.
    return outcome ? { ...completion, effect: outcome.effect } : completion;
  },
  apply: async (tx, row, to, { context, now, eventId, extra, cannotUndo }) => {
    const photos = await tx.query.completionPhoto.findMany({
      where: { completionId: row.id },
      columns: { slot: true },
    });
    const recorded = {
      evidence: row.evidence as z.infer<typeof evidenceValue>[],
      destination: row.destination ?? undefined,
      outOfRange: row.outOfRange ?? undefined,
      skipReason: row.skipReason ?? undefined,
    };
    const effect = await replaceStep(tx, context, {
      completion: row,
      work: row.instance,
      answer: { ...(to.answer ?? recorded), ...extra },
      hasPhotoAt: (slot) => photos.some((photo) => photo.slot === slot),
      eventId,
      now,
    });
    const about = { ...alertParams(row.instance), stepId: row.stepId };
    // She has been walked on since, so putting her back where this entry now says would overwrite something the farm
    // knows and this Correction does not. She stays where she was last seen and a person is asked which is true.
    const irreversible = Boolean(
      effect && "cannotUndo" in effect && effect.cannotUndo
    );
    if (irreversible) {
      cannotUndo({
        reason: "irreversible_effect",
        params: {
          ...about,
          ...(effect?.kind === "move" ? { toPenId: effect.toPenId } : {}),
        },
      });
    }
    // A checker has already signed this work off, on the figures as they were. The system cannot unsign it, so it says
    // so and the Manager decides.
    const signedOff = row.instance.state === "approved";
    if (signedOff) {
      cannotUndo({ reason: "corrected_after_sign_off", params: about });
    }
    return {
      roleUsed: context.roleUsed,
      effect,
      needsReview: irreversible || signedOff,
    };
  },
};

import type { RoleName } from "@OpenFarm/db/schema/farm";
import { stepCompletion } from "@OpenFarm/db/schema/instance";
import { MILK_DESTINATIONS, isClinicalStep } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { stepOf } from "../completion-store";
import type { EffectResult } from "../effects/effect";
import { factsAsShown, recordedFactsOf, stoodAside } from "../effects/effect";
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

type LoadedStep = NonNullable<Awaited<ReturnType<typeof loadStep>>>;

/** The Step a Completion answers, as the Version it was recorded on says it. */
const stepOfCompletion = (row: LoadedStep) =>
  stepOf(contentOf(row.instance.version), row.stepId);

/**
 * A Step's answer as the work screen shows it: the Evidence, the skip, where the milk went, the warning gone past — and
 * what its Effect recorded beside them, for a Step that feeds, counts or renews.
 */
const answerShown = z
  .object({
    // Trimmed, as the farm keeps it: a screen still showing what a phone held before it was sent may not have been.
    skipReason: z.string().trim().nullable(),
    evidence: z.array(evidenceValue),
    destination: z.enum(MILK_DESTINATIONS).nullable(),
    outOfRange: z.string().nullable(),
    feeding: z
      .array(
        z.object({
          feedItemId: z.string(),
          givenKg: z.number(),
          leftoverKg: z.number().optional(),
        })
      )
      .optional(),
    counts: z
      .array(
        z.object({
          feedItemId: z.string(),
          counted: z.number(),
          reason: z.string().optional(),
        })
      )
      .optional(),
    renewal: z.object({ expiresOn: z.string() }).optional(),
  })
  // In the farm's order and rounding, as the facts it holds are shown: a phone that recorded it offline holds the lines
  // as they were typed.
  .transform((answer) => ({ ...answer, ...factsAsShown(answer) }));

/**
 * What putting a Step right may change: its answer, in full — what was fed, counted or renewed with it. Facts left out
 * of the answer keep what the Effect recorded.
 */
export const stepCorrectionInput = correctionInput({
  answer: changeOf(
    stepCompletionInput.pick({
      evidence: true,
      destination: true,
      outOfRange: true,
      skipReason: true,
      feeding: true,
      counts: true,
      renewal: true,
    }),
    answerShown
  ),
});

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
  LoadedStep,
  Input["changes"],
  StepCorrected
> = {
  entity: "step_completion",
  table: stepCompletion,
  roles: ["owner", "manager", "staff", "vet"],
  // A Pregnancy Check is a clinical finding: the Vet's alone to put right, as a Diagnosis is.
  rolesFor: (row) =>
    isClinicalStep(stepOfCompletion(row)) ? ["vet"] : undefined,
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
    isHealthEntry: isClinicalStep(stepOfCompletion(row)),
  }),
  requireInScope: (scope, row) => requireWorkInScope(scope, row.instance),
  shown: async (tx, row) => ({
    answer: {
      skipReason: row.skipReason,
      evidence: row.evidence as z.infer<typeof evidenceValue>[],
      destination: row.destination,
      outOfRange: row.outOfRange,
      ...factsAsShown(await recordedFactsOf(tx, stepOfCompletion(row), row.id)),
    },
  }),
  shownAs: {
    answer: (to, holds) => ({
      skipReason: to.skipReason ?? null,
      evidence: to.evidence,
      destination: to.destination ?? null,
      outOfRange: to.outOfRange ?? null,
      // Facts left out of the answer keep what was recorded.
      ...factsAsShown({
        feeding: to.feeding ?? holds.feeding,
        counts: to.counts ?? holds.counts,
        renewal: to.renewal ?? holds.renewal,
      }),
    }),
  },
  // A renewed certificate's photograph, or the day it was issued, is kept on the farm's record rather than the renewal's,
  // so either sent is taken as a change.
  changesBeyondValues: (_extra, { answer }) =>
    Boolean(answer?.to.renewal?.certificate ?? answer?.to.renewal?.issuedOn),
  trail: async (tx, row, outcome) => {
    const completion = await readCompletion(tx, row.id);
    // With what the Effect decided, as a completion's own entry has: a corrected day that moved the calving work has to
    // say which work went where.
    return outcome ? { ...completion, effect: outcome.effect } : completion;
  },
  apply: async (tx, row, to, { context, now, eventId, cannotUndo }) => {
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
    const facts = await recordedFactsOf(tx, stepOfCompletion(row), row.id);
    const answer: NonNullable<typeof to.answer> = to.answer ?? recorded;
    const effect = await replaceStep(tx, context, {
      completion: row,
      work: row.instance,
      // What was fed, counted or renewed, as the Effect recorded it, unless the Correction says otherwise.
      answer: {
        ...answer,
        feeding: answer.feeding ?? facts.feeding,
        counts: answer.counts ?? facts.counts,
        renewal: answer.renewal ?? facts.renewal,
      },
      hasPhotoAt: (slot) => photos.some((photo) => photo.slot === slot),
      eventId,
      now,
    });
    const about = { ...alertParams(row.instance), stepId: row.stepId };
    // The farm has moved past what this Correction says — she has been walked on since, her calves have gone on — so the
    // Effect left the newer fact standing, the corrected answer is kept, and a person is asked which is true, told why.
    const aside = stoodAside(effect);
    if (aside) {
      cannotUndo({
        reason: "irreversible_effect",
        params: { ...about, ...aside.params, because: aside.because },
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
      needsReview: aside !== null || signedOff,
    };
  },
};

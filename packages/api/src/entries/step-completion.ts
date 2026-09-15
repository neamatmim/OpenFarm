import { eq } from "@OpenFarm/db/operators";
import { stepCompletion } from "@OpenFarm/db/schema/instance";
import type { SopContent, Step } from "@OpenFarm/domain";
import { MILK_DESTINATIONS, mayMove, sessionsPerDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { pregnancyTimesOf } from "../breeding-store";
import type { Recorder } from "../completion-store";
import {
  assertEvidenceComplete,
  assertMayWork,
  resolveStepAnimal,
  stepOf,
} from "../completion-store";
import type { EffectResult } from "../effects";
import { runStepEffect } from "../effects";
import { farmDay } from "../farm-clock";
import { lateEntry } from "../late";
import { photoInput } from "../photo-input";
import { contentOf } from "../sop-content";
import { requireMayMove, requireMove } from "../work-moves";
import type { EntryKind } from "./entry";

export const evidenceValue = z.union([z.boolean(), z.number(), z.string()]);

/** What one Feed Item was actually given, for a Step that feeds a Pen. */
export const feedingLine = z.object({
  feedItemId: z.string(),
  givenKg: z.number().min(0),
  leftoverKg: z.number().min(0).optional(),
});

/** What one Feed Item was counted at, for a Step that counts the store, and why it differs. */
export const countLine = z.object({
  feedItemId: z.string(),
  counted: z.number().min(0).max(10_000_000),
  reason: z.string().trim().max(200).optional(),
});

/** The new expiry, when the renewed certificate was issued, and its photograph, for the Step that renews the
 *  Registration. */
export const renewalInput = z.object({
  expiresOn: farmDay,
  issuedOn: farmDay.optional(),
  certificate: photoInput.optional(),
});

/** What one Step says, however it reaches the farm. */
export const stepCompletionInput = z.object({
  instanceId: z.string().trim().min(1),
  stepId: z.string().trim().min(1),
  animalTag: z.string().trim().optional(),
  /** One value per Evidence on the Step, in order. */
  evidence: z.array(evidenceValue).default([]),
  /** Where the milk went. Only for a Step whose effect writes a Milk Record; the server decides the final answer, because
   *  a cow under Withdrawal goes to Discard whatever the phone worked out from its last sync. */
  destination: z.enum(MILK_DESTINATIONS).optional(),
  /** What was actually put in front of the Pen, per Feed Item, for a Step that feeds. The Items come from the Pen's
   *  Ration rather than from the Version, so they travel beside the Evidence rather than as slots in it. */
  feeding: z.array(feedingLine).optional(),
  /** What was counted, per Feed Item, for a Step that counts the store. */
  counts: z.array(countLine).optional(),
  /** The new expiry and the renewed certificate, for the Step that renews the Registration. */
  renewal: renewalInput.optional(),
  /** Set when the person was warned a number was outside its range and went ahead. */
  outOfRange: z.string().trim().max(120).optional(),
  skipReason: z.string().trim().max(120).optional(),
  /** The Evidence slots this Step has photos for. Each photo follows as a Step photo of its own, so a megabyte of
   *  photograph cannot hold up a morning's litres — with signal or without. */
  photoSlots: z.array(z.number().int().min(0)).max(8).optional(),
});

export type StepCompletionInput = z.infer<typeof stepCompletionInput>;

/** What a Step says beside its Evidence, as a replacement for what it said before. */
export type StepAnswer = Pick<
  StepCompletionInput,
  | "evidence"
  | "destination"
  | "feeding"
  | "counts"
  | "renewal"
  | "outOfRange"
  | "skipReason"
>;

export interface StepRecorded {
  completionId: string;
  effect: EffectResult;
  /** False for the same Step arriving again — a phone replaying its Outbox — which changes nothing. */
  changed: boolean;
}

/** The Completion as the trail records it, so a Correction's before and after are the whole entry rather than the
 *  fields that happened to change. */
export const readCompletion = async (tx: Tx, id: string) =>
  (await tx.query.stepCompletion.findFirst({
    where: { id },
    columns: {
      stepId: true,
      animalId: true,
      status: true,
      skipReason: true,
      evidence: true,
      outOfRange: true,
      destination: true,
    },
  })) ?? null;

/** The work a Step is recorded on, as its Effect needs it. */
interface WorkForEffect {
  id: string;
  penId: string | null;
  animalId: string | null;
  dueAt: Date;
  createdAt: Date;
  cause: string | null;
}

/**
 * What a Step writes into the farm's records beyond its Evidence — the litres, the tank reading, the dose — in the
 * Step's own transaction and keyed on its Completion, so a replay cannot double-count and a replacement replaces. The
 * one place what an Effect is told is put together, whether the Step is recorded or put right.
 */
const runEffect = (
  tx: Tx,
  context: Recorder,
  {
    work,
    content,
    step,
    completionId,
    animalId,
    answer,
    eventId,
    recordedBy,
    recordedAt,
    now,
  }: {
    work: WorkForEffect;
    content: SopContent;
    step: Step;
    completionId: string;
    animalId: string | null;
    answer: StepAnswer;
    eventId: string;
    recordedBy: string;
    recordedAt: Date;
    now: Date;
  }
): Promise<EffectResult> =>
  runStepEffect(tx, {
    step,
    instance: {
      id: work.id,
      farmId: context.farm.id,
      penId: work.penId,
      animalId: work.animalId,
      dueAt: work.dueAt,
      raisedAt: work.createdAt,
      cause: work.cause,
    },
    completionId,
    animalId,
    evidence: answer.evidence,
    feeding: answer.feeding ?? [],
    counts: answer.counts ?? [],
    renewal: answer.renewal,
    destination: answer.destination,
    skipped: Boolean(answer.skipReason),
    feedTolerancePercent: context.farm.feedTolerancePercent,
    tolerancePercent: context.farm.milkTolerancePercent,
    pregnancyTimes: pregnancyTimesOf(context.farm),
    // From the Version doing the work, so a farm with more than one feeding routine divides by the schedule that raised
    // this Instance rather than by whichever was written first.
    sessionsPerDay: sessionsPerDayOf(content),
    // The Audit Event this is written under, so an Effect that has to put something in front of the Manager can do it in
    // the same transaction.
    eventId,
    roles: context.roles,
    roleUsed: context.roleUsed,
    recordedBy,
    recordedAt,
    now,
  });

/** Is this the same Step arriving again — a phone replaying its Outbox — or a different one? Compared on what it says,
 *  not on when it was sent: the same figures sent twice are one fact, and a different figure is a Correction whoever
 *  sent it. */
const sameAnswer = (
  existing: {
    status: string;
    skipReason: string | null;
    evidence: unknown;
    destination: string | null;
  },
  input: StepCompletionInput
): boolean =>
  existing.status === (input.skipReason ? "skipped" : "done") &&
  existing.skipReason === (input.skipReason ?? null) &&
  existing.destination === (input.destination ?? null) &&
  JSON.stringify(existing.evidence) === JSON.stringify(input.evidence);

/**
 * One Step done — once per animal where the Step repeats — with whatever its Effect writes into the farm's records.
 * Dated when it was done. A Step already recorded is a recorded fact: the same answer again changes nothing, and a
 * different one is a Correction, which asks why and checks the window.
 */
export const stepCompletionEntry: EntryKind<StepCompletionInput, StepRecorded> =
  {
    roles: ["owner", "manager", "staff", "vet"],
    visitingVet: true,

    trail: () => ({
      entity: "step_completion",
      action: "create",
      entityId: ({ completionId }) => completionId,
      // With what the Effect decided, so the trail reads what the farm did — a Destination forced to Discard reads as
      // Discard, not as what was asked for.
      after: async (tx, { completionId, effect }) => {
        const completion = await readCompletion(tx, completionId);
        return completion ? { ...completion, effect } : null;
      },
    }),

    needsPersonalSession: (input) => input.renewal !== undefined,

    heldRefusal: (input) =>
      input.renewal
        ? "The Registration's renewal is recorded from the Owner's own phone, with signal"
        : undefined,

    apply: async (tx, context, input, { id, doneAt, receivedAt, eventId }) => {
      const work = await tx.query.sopInstance.findFirst({
        where: { id: input.instanceId, farmId: context.farm.id },
        with: { version: { columns: { content: true } } },
      });
      if (!work) {
        throw new ORPCError("NOT_FOUND");
      }
      // Only on work still owed: finished work is corrected, and work closed as Missed or Called Off is not done at all.
      requireMayMove(work, "record");
      assertMayWork(context, work);
      const content = contentOf(work.version);
      const step = stepOf(content, input.stepId);
      const animalId = await resolveStepAnimal(
        tx,
        context.farm.id,
        step,
        work.penId,
        input.animalTag
      );
      const skipping = Boolean(input.skipReason);
      // The photos follow as Step photos of their own; the Step says which slots they answer.
      const promised = new Set(input.photoSlots);
      assertEvidenceComplete(step, input.evidence, skipping, (slot) =>
        promised.has(slot)
      );

      const already = await tx.query.stepCompletion.findFirst({
        where: {
          farmId: context.farm.id,
          instanceId: input.instanceId,
          stepId: input.stepId,
          animalKey: animalId ?? "",
        },
      });
      if (already) {
        if (!sameAnswer(already, input)) {
          throw lateEntry("That is already recorded; correct it instead", {
            completionId: already.id,
          });
        }
        // Nothing is written: rewriting the row would put a second person's name on the first person's work, and the
        // record says who did it.
        return { completionId: already.id, effect: null, changed: false };
      }

      // Never an update: a recorded fact changes only by Correction (ADR 0002). Two phones racing for the same Step land
      // here, and the second is told so rather than overwriting the first.
      const [saved] = await tx
        .insert(stepCompletion)
        .values({
          id,
          farmId: context.farm.id,
          instanceId: input.instanceId,
          stepId: input.stepId,
          animalId,
          animalKey: animalId ?? "",
          status: skipping ? "skipped" : "done",
          skipReason: input.skipReason ?? null,
          evidence: input.evidence,
          outOfRange: input.outOfRange ?? null,
          recordedBy: context.actor.id,
          deviceId: context.device?.id ?? null,
          destination: input.destination ?? null,
          recordedAt: doneAt,
          receivedAt,
        })
        .onConflictDoNothing()
        .returning({ id: stepCompletion.id });
      if (!saved) {
        throw lateEntry("That is already recorded; correct it instead");
      }
      const effect = await runEffect(tx, context, {
        work,
        content,
        step,
        completionId: saved.id,
        animalId,
        answer: input,
        eventId,
        recordedBy: context.actor.id,
        recordedAt: doneAt,
        now: receivedAt,
      });
      if (mayMove("start", work.state)) {
        await requireMove(tx, work, "start");
      }
      return { completionId: saved.id, effect, changed: true };
    },

    unchanged: (result) => !result.changed,
  };

/**
 * Puts a Step Completion's answer right, and its Effect with it — keyed on the same Completion, so a corrected litres
 * figure replaces its Milk Record and the Session's reconciliation is worked out afresh. Only the applying: whether it
 * may be put right, and why, is the Correction's to settle before it gets here.
 */
export const replaceStep = async (
  tx: Tx,
  context: Recorder,
  {
    completion,
    work,
    answer,
    hasPhotoAt,
    eventId,
    now,
  }: {
    completion: {
      id: string;
      stepId: string;
      animalId: string | null;
      recordedBy: string;
      recordedAt: Date;
    };
    work: WorkForEffect & { version: { content: unknown } };
    answer: StepAnswer;
    hasPhotoAt: (slot: number) => boolean;
    eventId: string;
    now: Date;
  }
): Promise<EffectResult> => {
  const content = contentOf(work.version);
  const step = stepOf(content, completion.stepId);
  const skipping = Boolean(answer.skipReason);
  assertEvidenceComplete(step, answer.evidence, skipping, hasPhotoAt);
  await tx
    .update(stepCompletion)
    .set({
      status: skipping ? "skipped" : "done",
      skipReason: answer.skipReason ?? null,
      evidence: answer.evidence,
      outOfRange: answer.outOfRange ?? null,
      destination: answer.destination ?? null,
    })
    .where(eq(stepCompletion.id, completion.id));
  return runEffect(tx, context, {
    work,
    content,
    step,
    completionId: completion.id,
    animalId: completion.animalId,
    answer,
    eventId,
    // Still the person who did it, and when: a Correction puts the answer right, not the history.
    recordedBy: completion.recordedBy,
    recordedAt: completion.recordedAt,
    now,
  });
};

import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { animal, animalMove } from "@OpenFarm/db/schema/herd";
import {
  completionPhoto,
  sopInstance,
  stepCompletion,
} from "@OpenFarm/db/schema/instance";
import type { MilkDestination, SopContent, Step } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { Context } from "./context";
import type { EffectResult } from "./effects";
import { runStepEffect } from "./effects";
import { assertPenIsTheirs, loadLiveAnimal, requirePen } from "./herd-store";
import { isOnTheFarm } from "./instances-store";

/**
 * An entry that was true when it was written and is not true now: the animal has been sold,
 * the work has been signed off, the cow has already been recorded. A phone out of signal
 * writes these honestly, so they are kept and put in front of a person rather than refused
 * (ADR 0002). Marked so a batch can tell them from an entry that was never valid at all —
 * a Step no Version has, an animal the farm has never heard of — which is the client's to
 * keep and fix.
 */
export const lateEntry = (message: string, data: object = {}) =>
  new ORPCError("CONFLICT", { message, data: { ...data, late: true } });

/** Was this refused because the world moved, rather than because the entry was wrong? */
export const isLate = (error: unknown): boolean =>
  error instanceof ORPCError &&
  (error.data as { late?: boolean } | undefined)?.late === true;

/** What one recorded Step says. The same shape whether it arrived on its own or in a batch
 *  from a phone that has been out of signal (ADR 0002). */
export interface CompletionEntry {
  instanceId: string;
  stepId: string;
  animalTag?: string;
  evidence: (boolean | number | string)[];
  destination?: MilkDestination;
  outOfRange?: string;
  skipReason?: string;
  photo?: {
    contentType: "image/jpeg" | "image/png" | "image/webp";
    data: string;
  };
  /** The phone's clock, for work captured offline. */
  recordedAt?: Date;
}

export interface Recorded {
  completionId: string;
  effect: EffectResult;
}

/** The context a record needs: who is recording, on which Farm, under which Role. */
export type Recorder = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
};

const contentOf = (version: { content: unknown }): SopContent =>
  version.content as SopContent;

/** The Step this Version declares, or nothing. */
export const stepOf = (content: SopContent, stepId: string): Step => {
  const step = content.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new ORPCError("NOT_FOUND", {
      message: `No step ${stepId} in this version`,
    });
  }
  return step;
};

/** The animal a per-animal Step is being recorded against — refusing one from another Pen,
 *  one that has left the farm, and an animal at all for a Step that runs once. */
export const resolveStepAnimal = async (
  tx: Tx,
  farmId: string,
  step: Step,
  instancePenId: string,
  animalTag: string | undefined
): Promise<string | null> => {
  if (!step.repeatPerAnimal) {
    if (animalTag) {
      throw new ORPCError("BAD_REQUEST", {
        message: "This step is recorded once",
      });
    }
    return null;
  }
  if (!animalTag) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step is recorded per animal",
    });
  }
  const beast = await tx.query.animal.findFirst({
    where: { farmId, tagNumber: animalTag.toUpperCase() },
    columns: { id: true, penId: true, state: true },
  });
  // A tag the farm has never had is not a changed world; it is a wrong entry, and whoever
  // wrote it needs it back.
  if (!beast) {
    throw new ORPCError("NOT_FOUND", {
      message: `No animal with tag ${animalTag}`,
    });
  }
  // An animal that has left keeps its Pen, so the Pen alone does not prove she is here —
  // and a Step that writes a farm record would otherwise book litres to a sold cow. Both of
  // these are the world moving under an entry that was true when it was written.
  if (beast.penId !== instancePenId || !isOnTheFarm(beast)) {
    throw lateEntry("That animal is not in this pen");
  }
  return beast.id;
};

/** An Instance a person may work: theirs by Pen, and pinned or claimed by nobody else. */
export const assertMayWork = (
  context: {
    roleUsed: string | null;
    penIds: string[];
    actor: { id: string };
    roles: string[];
    device: unknown;
  },
  instance: {
    penId: string;
    assignedTo: string | null;
    claimedBy: string | null;
    assignedRole: string;
  }
) => {
  // The Instance says who does this work; holding some other Role is not enough. The Owner
  // and the Manager may always step in — someone has to be able to unstick a shift.
  const runsTheFarm =
    context.roles.includes("owner") || context.roles.includes("manager");
  if (!(runsTheFarm || context.roles.includes(instance.assignedRole))) {
    throw new ORPCError("FORBIDDEN", {
      message: `This work is for ${instance.assignedRole}`,
    });
  }
  // A Vet's clinical work is signed on their own phone, never a shared one (ADR 0003).
  if (instance.assignedRole === "vet" && context.device) {
    throw new ORPCError("FORBIDDEN", {
      message: "This can only be done from your own phone, not a shed phone",
    });
  }
  if (
    context.roleUsed === "staff" &&
    !context.penIds.includes(instance.penId)
  ) {
    throw new ORPCError("FORBIDDEN", { message: "That pen is not yours" });
  }
  if (instance.assignedTo && instance.assignedTo !== context.actor.id) {
    throw new ORPCError("FORBIDDEN", {
      message: "This is pinned to someone else",
    });
  }
  if (instance.claimedBy && instance.claimedBy !== context.actor.id) {
    throw new ORPCError("FORBIDDEN", {
      message: "Someone else is working on this",
    });
  }
};

/** A Step is either skipped with a reason — only where it repeats per animal — or done with
 *  everything the Version marks required. Checked per slot, not by count: a Step with an
 *  optional note and a required number is not satisfied by filling only the note. A photo
 *  arrives in its own field rather than in the evidence array, so it counts for its slot. */
export const assertEvidenceComplete = (
  step: Step,
  evidence: unknown[],
  skipping: boolean,
  hasPhoto: boolean
): void => {
  if (skipping) {
    if (!step.repeatPerAnimal) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Only a per-animal step can be skipped",
      });
    }
    return;
  }
  const missing = step.evidence
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => {
      if (!item.required) {
        return false;
      }
      if (item.type === "photo") {
        return !hasPhoto;
      }
      const value = evidence[index];
      return value === undefined || value === null || value === "";
    });
  if (missing.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step needs everything marked required",
      data: { missing: missing.map(({ index }) => index) },
    });
  }
};

/** Is this the same entry arriving again — a phone replaying its outbox — or a different
 *  one? Compared on what the entry says, not on when it was sent: the same figures sent
 *  twice are one fact, and a different figure is a Correction whoever sent it. */
const sameEntry = (
  existing: {
    status: string;
    skipReason: string | null;
    evidence: unknown;
    destination: string | null;
  },
  input: CompletionEntry,
  skipping: boolean
): boolean =>
  existing.status === (skipping ? "skipped" : "done") &&
  existing.skipReason === (input.skipReason ?? null) &&
  existing.destination === (input.destination ?? null) &&
  JSON.stringify(existing.evidence) === JSON.stringify(input.evidence);

/**
 * Records one Step, with whatever its effect writes into the farm's records, on the caller's
 * transaction. Throwing rolls the caller back — which is what both callers want: a single
 * entry with its Audit Event, or a batch that applies whole or not at all.
 *
 * `id` lets the client name the record it is creating, so an outbox replay is the same fact
 * rather than a second one.
 */
export const applyCompletion = async (
  tx: Tx,
  context: Recorder,
  input: CompletionEntry,
  receivedAt: Date,
  id?: string
): Promise<Recorded> => {
  const instance = await tx.query.sopInstance.findFirst({
    where: { id: input.instanceId, farmId: context.farm.id },
    with: { version: { columns: { content: true } } },
  });
  if (!instance) {
    throw new ORPCError("NOT_FOUND");
  }
  if (instance.state === "completed" || instance.state === "approved") {
    throw lateEntry("This work is already finished");
  }
  assertMayWork(context, instance);
  const content = contentOf(instance.version);
  const step = stepOf(content, input.stepId);
  const animalId = await resolveStepAnimal(
    tx,
    context.farm.id,
    step,
    instance.penId,
    input.animalTag
  );
  const skipping = Boolean(input.skipReason);
  assertEvidenceComplete(step, input.evidence, skipping, Boolean(input.photo));

  // An entry that already exists is a recorded fact, and a recorded fact changes only by
  // Correction. The phone may still replay the same entry — that is how an outbox works
  // (ADR 0002) — so an identical one is accepted and changes nothing; a different one is
  // sent to correctStep, which asks why and checks the window.
  const already = await tx.query.stepCompletion.findFirst({
    where: {
      farmId: context.farm.id,
      instanceId: input.instanceId,
      stepId: input.stepId,
      animalKey: animalId ?? "",
    },
  });
  if (already && !sameEntry(already, input, skipping)) {
    throw lateEntry("That is already recorded; correct it instead", {
      completionId: already.id,
    });
  }

  const values = {
    farmId: context.farm.id,
    instanceId: input.instanceId,
    stepId: input.stepId,
    animalId,
    animalKey: animalId ?? "",
    status: skipping ? ("skipped" as const) : ("done" as const),
    skipReason: input.skipReason ?? null,
    evidence: input.evidence,
    outOfRange: input.outOfRange ?? null,
    recordedBy: context.actor.id,
    deviceId: context.device?.id ?? null,
    destination: input.destination ?? null,
    recordedAt: input.recordedAt ?? receivedAt,
    receivedAt,
  };
  const [saved] = await tx
    .insert(stepCompletion)
    .values({ id: id ?? uuidv7(receivedAt), ...values })
    .onConflictDoUpdate({
      target: [
        stepCompletion.instanceId,
        stepCompletion.stepId,
        stepCompletion.animalKey,
      ],
      set: values,
    })
    .returning({ id: stepCompletion.id });
  if (!saved) {
    throw new ORPCError("CONFLICT", {
      message: "That entry could not be saved",
    });
  }
  // The Step's effect writes the farm's record — the litres, the tank reading — in this
  // same transaction, keyed on the Completion so a replay cannot double-count.
  const effect = await runStepEffect(tx, {
    step,
    instance: {
      id: instance.id,
      farmId: context.farm.id,
      penId: instance.penId,
      dueAt: instance.dueAt,
    },
    completionId: saved.id,
    animalId,
    evidence: input.evidence,
    destination: input.destination,
    skipped: skipping,
    tolerancePercent: context.farm.milkTolerancePercent,
    recordedBy: context.actor.id,
    recordedAt: values.recordedAt,
    now: receivedAt,
  });
  if (input.photo) {
    await tx
      .insert(completionPhoto)
      .values({
        completionId: saved.id,
        farmId: context.farm.id,
        contentType: input.photo.contentType,
        data: input.photo.data,
        createdAt: receivedAt,
      })
      .onConflictDoUpdate({
        target: completionPhoto.completionId,
        set: {
          contentType: input.photo.contentType,
          data: input.photo.data,
          createdAt: receivedAt,
        },
      });
  }
  if (instance.state === "due" || instance.state === "sent_back") {
    await tx
      .update(sopInstance)
      .set({ state: "in_progress" })
      .where(eq(sopInstance.id, input.instanceId));
  }
  return { completionId: saved.id, effect };
};

/**
 * Moves one Animal to another Pen, on the caller's transaction. The same rules the single
 * procedure applies: the Animal must still be here, and both Pens must be the mover's to
 * touch. Extracted so a batch from a phone that has been out of signal records a Move the
 * same way a phone in signal does (ADR 0002).
 */
export const applyMove = async (
  tx: Tx,
  context: Recorder,
  input: { tagNumber: string; toPenId: string; reason?: string },
  movedAt: Date
): Promise<string> => {
  const tagNumber = input.tagNumber.toUpperCase();
  const current = await loadLiveAnimal(tx, context.farm.id, tagNumber);
  assertPenIsTheirs(context, current.penId);
  assertPenIsTheirs(context, input.toPenId);
  await requirePen(tx, context.farm.id, input.toPenId);
  await tx
    .update(animal)
    .set({ penId: input.toPenId, updatedAt: movedAt })
    .where(and(eq(animal.farmId, context.farm.id), eq(animal.id, current.id)));
  await tx.insert(animalMove).values({
    id: uuidv7(movedAt),
    farmId: context.farm.id,
    animalId: current.id,
    fromPenId: current.penId,
    toPenId: input.toPenId,
    fromSide: current.side,
    toSide: current.side,
    reason: input.reason ?? null,
    movedBy: context.actor.id,
    movedAt,
  });
  return current.id;
};

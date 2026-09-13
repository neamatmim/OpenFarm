import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import {
  completionPhoto,
  sopInstance,
  stepCompletion,
} from "@OpenFarm/db/schema/instance";
import type { MilkDestination, SopContent, Step } from "@OpenFarm/domain";
import { sessionsPerDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { pregnancyTimesOf } from "./breeding-store";
import type { Context } from "./context";
import type { EffectResult } from "./effects";
import { runStepEffect } from "./effects";
import {
  assertPenIsTheirs,
  loadLiveAnimal,
  recordMove,
  requirePen,
} from "./herd-store";
import { animalsForInstance, isOnTheFarm } from "./instances-store";
import { contentOf } from "./sop-content";
import type { StockCountLine } from "./stock-store";

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
  /** What was actually put in front of the Pen, per Feed Item, for a Step that feeds. The
   *  Items come from the Pen's Ration rather than from the Version, so they travel here
   *  rather than as Evidence slots. */
  feeding?: { feedItemId: string; givenKg: number; leftoverKg?: number }[];
  /** What was counted of each Feed Item, for a Step that counts the store — and why it differs from
   *  what the store was thought to hold. The Items are the farm's, not the Version's. */
  counts?: StockCountLine[];
  outOfRange?: string;
  skipReason?: string;
  photos?: {
    slot: number;
    contentType: "image/jpeg" | "image/png" | "image/webp";
    data: string;
  }[];
  /** The Evidence slots this entry has photos for, when they travel separately — a phone's
   *  outbox sends the figures and the images as their own entries, so a megabyte of image
   *  cannot hold up a morning's litres (ADR 0002). */
  photoSlots?: number[];
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
  // Somebody else holding the work is not a question of permission: it is the world having
  // moved, which is exactly what happens to a phone that has been out of range. Marked as
  // such so a batch keeps the entry rather than handing it back.
  if (instance.assignedTo && instance.assignedTo !== context.actor.id) {
    throw lateEntry("This is pinned to someone else");
  }
  if (instance.claimedBy && instance.claimedBy !== context.actor.id) {
    throw lateEntry("Someone else is working on this");
  }
};

/** Which Steps may be skipped with a reason: one done animal by animal, where the animal is
 *  the thing being skipped — and a dose, which is about the one animal the Prescription names
 *  without repeating, so that "the bottle was empty" can be recorded rather than go quiet. And a
 *  service: the farm serves some cows a second time in a heat and not others, so the AI work
 *  carries a second service Step that "once was enough" has to be able to pass. */
const maySkip = (step: Step): boolean =>
  step.repeatPerAnimal ||
  step.effect?.kind === "treatment" ||
  step.effect?.kind === "service";

/** A Step is either skipped with a reason — only where a reason means something — or done with
 *  everything the Version marks required. Checked per slot, not by count: a Step with an
 *  optional note and a required number is not satisfied by filling only the note. A photo
 *  arrives in its own field rather than in the evidence array, so it counts for its slot. */
/** Whether a slot has an answer in it. Spaces are not an answer: a required note filled with
 *  nothing is a required note nobody filled in. */
const filledIn = (value: unknown): boolean => {
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  return !(value === undefined || value === null);
};

export const assertEvidenceComplete = (
  step: Step,
  evidence: unknown[],
  skipping: boolean,
  /** Whether a photo answers that slot. A Step may ask for more than one, and a photo that
   *  could not say which it answered would be a photo nobody can read back. */
  hasPhotoAt: (slot: number) => boolean
): void => {
  if (skipping) {
    if (!maySkip(step)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Only a per-animal step or a dose can be skipped",
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
        return !hasPhotoAt(index);
      }
      return !filledIn(evidence[index]);
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
 * Puts one photo against the slot of the Step it answers. Its own write, whether it came
 * with the entry or as an entry of its own, so a phone replaying either is the same picture
 * rather than a second one.
 */
export const applyPhoto = async (
  tx: Tx,
  context: Recorder,
  photo: {
    completionId: string;
    slot: number;
    contentType: "image/jpeg" | "image/png" | "image/webp";
    data: string;
  },
  now: Date
): Promise<string> => {
  const completion = await tx.query.stepCompletion.findFirst({
    where: { id: photo.completionId, farmId: context.farm.id },
    columns: { id: true },
  });
  if (!completion) {
    // The entry it belongs to has not arrived, or never will. The photo is not wrong; it is
    // early or orphaned, and either way somebody should see it rather than lose it.
    throw lateEntry("The entry this photo belongs to is not here");
  }
  const values = {
    farmId: context.farm.id,
    contentType: photo.contentType,
    data: photo.data,
    createdAt: now,
  };
  await tx
    .insert(completionPhoto)
    .values({ completionId: photo.completionId, slot: photo.slot, ...values })
    .onConflictDoUpdate({
      target: [completionPhoto.completionId, completionPhoto.slot],
      set: values,
    });
  return photo.completionId;
};

/**
 * An entry that already exists is a recorded fact, and a recorded fact changes only by
 * Correction. The phone may still replay the same entry — that is how an outbox works
 * (ADR 0002) — so an identical one changes nothing and is handed back as it stands; a
 * different one goes to correctStep, which asks why and checks the window.
 */
const alreadyRecorded = async (
  tx: Tx,
  context: Recorder,
  input: CompletionEntry,
  animalId: string | null,
  skipping: boolean
): Promise<Recorded | null> => {
  const already = await tx.query.stepCompletion.findFirst({
    where: {
      farmId: context.farm.id,
      instanceId: input.instanceId,
      stepId: input.stepId,
      animalKey: animalId ?? "",
    },
  });
  if (!already) {
    return null;
  }
  if (!sameEntry(already, input, skipping)) {
    throw lateEntry("That is already recorded; correct it instead", {
      completionId: already.id,
    });
  }
  // Nothing is written: rewriting the row would put a second person's name on the first
  // person's work, and the record says who did it.
  return { completionId: already.id, effect: null };
};

/** Which Evidence slots have a picture: one that came with the entry, or one the phone has
 *  said is on its way as an entry of its own. */
const photoSlots = (input: CompletionEntry): ((slot: number) => boolean) => {
  const here = new Set(input.photos?.map((photo) => photo.slot));
  const promised = new Set(input.photoSlots);
  return (slot) => here.has(slot) || promised.has(slot);
};

/** The lines a Step carries beside its Evidence — what a Pen was fed, what the store was counted at —
 *  or none, for the Steps that carry neither. */
const linesOf = (input: CompletionEntry) => ({
  feeding: input.feeding ?? [],
  counts: input.counts ?? [],
});

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
  eventId: string,
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
  // Either the photo is here, or the phone has said it is coming as its own entry.
  assertEvidenceComplete(step, input.evidence, skipping, photoSlots(input));

  const standing = await alreadyRecorded(
    tx,
    context,
    input,
    animalId,
    skipping
  );
  if (standing) {
    return standing;
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
  // Never an update: a recorded fact changes only by Correction (ADR 0002). Two phones
  // racing for the same Step land here, and the second is told so rather than overwriting
  // the first.
  const [saved] = await tx
    .insert(stepCompletion)
    .values({ id: id ?? uuidv7(receivedAt), ...values })
    .onConflictDoNothing()
    .returning({ id: stepCompletion.id });
  if (!saved) {
    throw lateEntry("That is already recorded; correct it instead");
  }
  // The Step's effect writes the farm's record — the litres, the tank reading — in this
  // same transaction, keyed on the Completion so a replay cannot double-count.
  const effect = await runStepEffect(tx, {
    step,
    instance: {
      id: instance.id,
      farmId: context.farm.id,
      penId: instance.penId,
      animalId: instance.animalId,
      dueAt: instance.dueAt,
      raisedAt: instance.createdAt,
      cause: instance.cause,
    },
    completionId: saved.id,
    animalId,
    evidence: input.evidence,
    ...linesOf(input),
    feedTolerancePercent: context.farm.feedTolerancePercent,
    // The Audit Event this Completion is written under, so an effect that has to put something
    // in front of the Manager can do it in the same transaction.
    eventId,
    roles: context.roles,
    // From the Version doing the work, so a farm with more than one feeding routine divides
    // by the schedule that raised this Instance rather than by whichever was written first.
    sessionsPerDay: sessionsPerDayOf(content),
    destination: input.destination,
    skipped: skipping,
    tolerancePercent: context.farm.milkTolerancePercent,
    pregnancyTimes: pregnancyTimesOf(context.farm),
    recordedBy: context.actor.id,
    recordedAt: values.recordedAt,
    now: receivedAt,
  });
  for (const photo of input.photos ?? []) {
    // Sequential: a Step asks for two pictures at most in practice, and they go in beside
    // the entry they answer.
    // oxlint-disable-next-line no-await-in-loop
    await applyPhoto(
      tx,
      context,
      { completionId: saved.id, ...photo },
      receivedAt
    );
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
  movedAt: Date,
  /** The client's own id for the Move, so an outbox replay is the same fact rather than a
   *  second journey. */
  id?: string
): Promise<string> => {
  const tagNumber = input.tagNumber.toUpperCase();
  const current = await loadLiveAnimal(tx, context.farm.id, tagNumber);
  assertPenIsTheirs(context, current.penId);
  assertPenIsTheirs(context, input.toPenId);
  await requirePen(tx, context.farm.id, input.toPenId);
  await recordMove(tx, {
    farmId: context.farm.id,
    beast: current,
    toPenId: input.toPenId,
    reason: input.reason,
    movedBy: context.actor.id,
    movedAt,
    id,
    now: movedAt,
  });
  return current.id;
};

/**
 * Takes an Instance for the person recording. Exclusive: only an unclaimed one can be
 * claimed, so two phones cannot both hold a shift. A phone that claimed with no signal and
 * arrives to find someone else already holding it has not done anything wrong — the world
 * moved while it was out of range — so it is told so as a late entry rather than refused.
 */
export const applyClaim = async (
  tx: Tx,
  context: Recorder,
  instanceId: string,
  now: Date
): Promise<string> => {
  const instance = await tx.query.sopInstance.findFirst({
    where: { id: instanceId, farmId: context.farm.id },
    columns: {
      penId: true,
      assignedTo: true,
      claimedBy: true,
      state: true,
      assignedRole: true,
    },
  });
  if (!instance) {
    throw new ORPCError("NOT_FOUND");
  }
  assertMayWork(context, instance);
  const [row] = await tx
    .update(sopInstance)
    .set({
      claimedBy: context.actor.id,
      claimedAt: now,
      state: "in_progress",
    })
    .where(and(eq(sopInstance.id, instanceId), isNull(sopInstance.claimedBy)))
    .returning({ id: sopInstance.id });
  if (!row && instance.claimedBy !== context.actor.id) {
    throw lateEntry("Someone else took this first");
  }
  return instanceId;
};

/**
 * Finishes an Instance. Refused while any Step — or any animal within a per-animal Step — is
 * neither done nor skipped, which is a thing a phone can be wrong about: it finished on what
 * it could see, and a cow may have joined the Pen since.
 */
export const applyComplete = async (
  tx: Tx,
  context: Recorder,
  instanceId: string,
  now: Date
): Promise<{ changed: boolean }> => {
  const instance = await tx.query.sopInstance.findFirst({
    where: { id: instanceId, farmId: context.farm.id },
    with: { version: { columns: { content: true } }, completions: true },
  });
  if (!instance) {
    throw new ORPCError("NOT_FOUND");
  }
  assertMayWork(context, instance);
  if (instance.state === "completed" || instance.state === "approved") {
    // Already finished — by this phone's earlier send, or by somebody else. Nothing changes,
    // and the caller is told so: an Audit Event for a transition that did not happen would
    // be a trail that lies.
    return { changed: false };
  }
  if (instance.state !== "in_progress" && instance.state !== "sent_back") {
    throw lateEntry(`This work is ${instance.state}, not in progress`);
  }
  const content = contentOf(instance.version);
  const animals = await animalsForInstance(
    tx,
    context.farm.id,
    instance.penId,
    content,
    instance.animalId
  );
  const outstanding: string[] = [];
  for (const step of content.steps) {
    const done = instance.completions.filter(
      (completion) => completion.stepId === step.id
    );
    if (step.repeatPerAnimal) {
      const covered = new Set(done.map((completion) => completion.animalId));
      const missing = animals.filter((beast) => !covered.has(beast.id));
      if (missing.length > 0) {
        outstanding.push(
          `${step.id}: ${missing.map((beast) => beast.tagNumber).join(", ")}`
        );
      }
    } else if (done.length === 0) {
      outstanding.push(step.id);
    }
  }
  if (outstanding.length > 0) {
    // A phone finishing on what it could see is not a phone in the wrong; the Pen has
    // changed under it, and somebody should look.
    throw lateEntry(`Not finished yet — ${outstanding.join("; ")}`, {
      outstanding,
    });
  }
  await tx
    .update(sopInstance)
    .set({ state: "completed", completedAt: now })
    .where(eq(sopInstance.id, instanceId));
  return { changed: true };
};

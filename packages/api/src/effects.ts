import type { MilkDestination, Step } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { eq } from "@OpenFarm/db/operators";
import { animal, animalMove } from "@OpenFarm/db/schema/herd";

import type { Tx } from "./audit";
import {
  loadLiveAnimal,
  moveOpenWorkWith,
  movedSince,
  recordMove,
  requirePen,
} from "./herd-store";
import {
  ensureSession,
  reReconcile,
  reconcileSession,
  removeMilkRecord,
  writeMilkRecord,
} from "./milk-store";

/**
 * What a Step wrote into the farm's records beyond the Evidence itself — reported back so
 * the phone can show the person what the gate decided, and so the Audit Event's `after`
 * says what actually happened rather than what was asked for.
 */
export type EffectResult =
  | { kind: "milk_record"; destination: MilkDestination; forced: boolean }
  | {
      kind: "move";
      fromPenId: string | null;
      toPenId: string;
      /** False when she was already standing there: the Step was done, no journey was made. */
      moved: boolean;
      /** She has been moved again since, so a Correction cannot walk this one back and a
       *  person has to decide what the truth is. */
      cannotUndo: boolean;
    }
  | {
      kind: "bulk_total";
      sumBulkLitres: number;
      differenceLitres: number;
      differencePercent: number;
      flagged: boolean;
    }
  | null;

/** The figure a record-writing Step asks for: the first `number` slot the Version declares.
 *  A Step that writes a record has exactly one figure to write — litres, kilograms, a dose. */
const numberIn = (step: Step, evidence: unknown[]): number => {
  const index = step.evidence.findIndex((item) => item.type === "number");
  const value = index === -1 ? undefined : evidence[index];
  const typed = Number(value);
  if (
    index === -1 ||
    value === undefined ||
    value === "" ||
    Number.isNaN(typed)
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step records a figure, and none was given",
    });
  }
  return typed;
};

/** The Pen a moving Step walked her to: the first `choice` slot the Version declares. A
 *  Step that moves an animal offers the Pens she may be walked to, and the person picks. */
const choiceIn = (step: Step, evidence: unknown[]): string => {
  const index = step.evidence.findIndex((item) => item.type === "choice");
  const value = index === -1 ? undefined : evidence[index];
  if (typeof value !== "string" || value === "") {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step moves an animal, and no pen was chosen",
    });
  }
  return value;
};

export interface EffectInput {
  step: Step;
  instance: { id: string; farmId: string; penId: string; dueAt: Date };
  completionId: string;
  animalId: string | null;
  evidence: unknown[];
  destination: MilkDestination | undefined;
  skipped: boolean;
  tolerancePercent: number;
  recordedBy: string;
  recordedAt: Date;
  now: Date;
}


/**
 * Walks her to the Pen the Step recorded, and writes the Move that says the Playbook did it.
 *
 * Keyed on the Completion, like every other effect: a phone replaying an entry, or a Manager
 * correcting one, changes where she went rather than sending her on a second journey. What
 * it will not do is rewrite where she is when anything has moved her since the entry was
 * recorded — that is a fact the farm has and this Correction does not, so she stays where she
 * was last seen and a person is asked (Needs Review, irreversible effect).
 *
 * The Pen she is walked to is not checked against the doer's Pen Assignments, unlike a Move
 * somebody records by hand. The destinations are the Owner's, authored into the Step, and a
 * milker assigned to the milking pen has to be able to walk a cow to the dry pen — that is
 * what the procedure says to do. What they may work on is already settled by the Instance.
 */
const applyMoveEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  if (!input.animalId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step moves an animal, and it was not recorded against one",
    });
  }
  const beast = await tx.query.animal.findFirst({
    where: { id: input.animalId, farmId: input.instance.farmId },
    columns: { id: true, tagNumber: true, penId: true, side: true, state: true },
  });
  if (!beast) {
    throw new ORPCError("NOT_FOUND", { message: "No such animal" });
  }
  // An animal that has left the farm cannot be walked anywhere, whoever is asking.
  const live = await loadLiveAnimal(tx, input.instance.farmId, beast.tagNumber);
  const already = await tx.query.animalMove.findFirst({
    where: { completionId: input.completionId },
    columns: { id: true, fromPenId: true, toPenId: true },
  });
  // Asked of the Moves themselves, not of where she is standing: a cow walked away and back
  // again is standing where this entry left her, and is still a cow the farm has learned
  // something newer about.
  const somethingMovedHer = await movedSince(
    tx,
    live.id,
    input.recordedAt,
    input.completionId
  );

  // Corrected to a skip: the journey is undone if nothing has happened to her since.
  if (input.skipped) {
    if (!already) {
      return null;
    }
    if (somethingMovedHer) {
      return {
        kind: "move",
        fromPenId: already.fromPenId,
        toPenId: already.toPenId,
        moved: false,
        cannotUndo: true,
      };
    }
    await tx
      .delete(animalMove)
      .where(eq(animalMove.completionId, input.completionId));
    if (already.fromPenId) {
      await tx
        .update(animal)
        .set({ penId: already.fromPenId, updatedAt: input.now })
        .where(eq(animal.id, live.id));
      await moveOpenWorkWith(
        tx,
        input.instance.farmId,
        live.id,
        already.fromPenId
      );
    }
    return null;
  }

  const toPenId = choiceIn(input.step, input.evidence);
  // A Pen that is not this farm's is not somewhere she can be walked to.
  await requirePen(tx, input.instance.farmId, toPenId);
  const fromPenId = already?.fromPenId ?? live.penId;

  if (somethingMovedHer) {
    // Record what the Step now says, and leave her where the farm last saw her.
    if (already) {
      await tx
        .update(animalMove)
        .set({ toPenId })
        .where(eq(animalMove.completionId, input.completionId));
    }
    return { kind: "move", fromPenId, toPenId, moved: false, cannotUndo: true };
  }

  if (already) {
    await tx
      .update(animalMove)
      .set({ toPenId })
      .where(eq(animalMove.completionId, input.completionId));
    await tx
      .update(animal)
      .set({ penId: toPenId, updatedAt: input.now })
      .where(eq(animal.id, live.id));
    await moveOpenWorkWith(tx, input.instance.farmId, live.id, toPenId);
  } else if (fromPenId !== toPenId) {
    await recordMove(tx, {
      farmId: input.instance.farmId,
      beast: live,
      toPenId,
      completionId: input.completionId,
      movedBy: input.recordedBy,
      movedAt: input.recordedAt,
      now: input.now,
    });
  }
  return {
    kind: "move",
    fromPenId,
    toPenId,
    moved: fromPenId !== toPenId,
    cannotUndo: false,
  };
};

/**
 * Runs the effect a Step declares, inside the Completion's own transaction: if the effect
 * fails, the Completion and its Audit Event fail with it. Every effect is keyed on the
 * Completion, so a phone that replays an entry — or a Manager who corrects one — replaces
 * what it wrote rather than adding to it (ADR 0002).
 */
export const runStepEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  const { effect } = input.step;
  // Only a Step that writes a Milk Record has anywhere for milk to go. A tank reading filed
  // as "calves" would be nonsense the record then has to carry.
  if (input.destination && effect?.kind !== "milk_record") {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step does not record where the milk went",
    });
  }
  if (!effect) {
    return null;
  }
  if (effect.kind === "move") {
    return await applyMoveEffect(tx, input);
  }
  // Only the milk effects belong to a Milking Session, and only they may open one: a Step
  // that walks a cow to another Pen has no business creating a session nobody milked into.
  const sessionId = await ensureSession(tx, input.instance, input.now);

  if (effect.kind === "milk_record") {
    if (input.skipped || !input.animalId) {
      // A cow skipped — or recorded before, then skipped — has no litres to her name.
      await removeMilkRecord(tx, input.completionId);
      await reReconcile(tx, sessionId, input.tolerancePercent, input.now);
      return null;
    }
    const written = await writeMilkRecord(tx, {
      farmId: input.instance.farmId,
      sessionId,
      completionId: input.completionId,
      animalId: input.animalId,
      litres: numberIn(input.step, input.evidence),
      requested: input.destination ?? "bulk",
      recordedBy: input.recordedBy,
      recordedAt: input.recordedAt,
      now: input.now,
    });
    // A cow corrected after the tank was read would otherwise leave a stale difference.
    await reReconcile(tx, sessionId, input.tolerancePercent, input.now);
    return { kind: "milk_record", ...written };
  }

  const result = await reconcileSession(
    tx,
    sessionId,
    numberIn(input.step, input.evidence),
    input.tolerancePercent,
    input.now
  );
  return { kind: "bulk_total", ...result };
};

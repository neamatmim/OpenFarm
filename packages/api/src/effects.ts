import type { MilkDestination, Step } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
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

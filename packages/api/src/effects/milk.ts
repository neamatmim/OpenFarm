import type { Tx } from "../audit";
import {
  ensureSession,
  reReconcile,
  reconcileSession,
  removeMilkRecord,
  writeMilkRecord,
} from "../milk-store";
import type { EffectInput, EffectKind, EffectResult } from "./effect";
import { numberIn, penOf } from "./evidence";

type MilkFacts = Pick<
  EffectInput,
  | "step"
  | "instance"
  | "animalId"
  | "evidence"
  | "destination"
  | "skipped"
  | "completionId"
  | "tolerancePercent"
  | "recordedBy"
  | "recordedAt"
  | "now"
>;

/** The Milking Session a milk Step belongs to. Only the milk Effects may open one: a Step that walks a cow to another Pen
 *  has no business creating a session nobody milked into. */
const sessionOf = (tx: Tx, input: MilkFacts) =>
  ensureSession(tx, { ...input.instance, penId: penOf(input) }, input.now);

/** Records what one cow gave this session, and where it went — the Gate deciding where it may go. */
const recordTheMilk = async (
  tx: Tx,
  input: MilkFacts
): Promise<EffectResult> => {
  const sessionId = await sessionOf(tx, input);
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
};

/** Records the session's tank reading, and works out how far it is from what the cows gave. */
const readTheTank = async (tx: Tx, input: MilkFacts): Promise<EffectResult> => {
  const sessionId = await sessionOf(tx, input);
  const result = await reconcileSession(
    tx,
    sessionId,
    numberIn(input.step, input.evidence),
    input.tolerancePercent,
    input.now
  );
  return { kind: "bulk_total", ...result };
};

/** A Step that records one cow's milk. */
export const milkRecordEffect: EffectKind<MilkFacts> = {
  kind: "milk_record",
  apply: recordTheMilk,
};

/** A Step that records the session's tank reading. */
export const bulkTotalEffect: EffectKind<MilkFacts> = {
  kind: "bulk_total",
  apply: readTheTank,
};

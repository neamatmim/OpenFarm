import { uuidv7 } from "@OpenFarm/db/ids";
import { campaignLotNumber } from "@OpenFarm/db/schema/health";

import type { Tx } from "../audit";
import type { EffectInput, EffectKind, EffectResult } from "./effect";
import { noteIn } from "./evidence";

type LotNumberFacts = Pick<
  EffectInput,
  | "step"
  | "instance"
  | "evidence"
  | "completionId"
  | "recordedBy"
  | "recordedAt"
  | "now"
>;

/**
 * The Lot Number a Campaign was given from, asked once for the Pen. Every vaccine dose of the Campaign without a
 * Lot Number of its own reads it from here, so a Correction to this Step puts all of them right at once.
 *
 * It is never taken back: a Step done once cannot be skipped, and its note is required, so a vaccination given
 * from this vial cannot be made untraceable after the fact.
 */
const keepTheLotNumber = async (
  tx: Tx,
  input: LotNumberFacts
): Promise<EffectResult> => {
  // A required note on a Step that runs once: the published Version says it is there.
  const lotNumber = noteIn(input.step, input.evidence) ?? "";
  const written = {
    lotNumber,
    completionId: input.completionId,
    recordedBy: input.recordedBy,
    recordedAt: input.recordedAt,
  };
  await tx
    .insert(campaignLotNumber)
    .values({
      id: uuidv7(input.now),
      farmId: input.instance.farmId,
      instanceId: input.instance.id,
      ...written,
    })
    .onConflictDoUpdate({ target: campaignLotNumber.instanceId, set: written });
  return { kind: "lot_number", lotNumber };
};

/** A Step that records the Lot Number a Campaign is given from. */
export const lotNumberEffect: EffectKind<LotNumberFacts> = {
  kind: "lot_number",
  apply: keepTheLotNumber,
};

import type { Tx } from "../audit";
import { recordHeadCount } from "../head-count-store";
import type { EffectInput, EffectKind, EffectResult } from "./effect";
import { numberIn } from "./evidence";

type HeadCountFacts = Pick<
  EffectInput,
  | "step"
  | "instance"
  | "completionId"
  | "evidence"
  | "recordedBy"
  | "recordedAt"
  | "now"
>;

/** Counts the Pen at lock-up, blind, and sets the count beside the animals the register puts there. */
const countThePen = async (
  tx: Tx,
  input: HeadCountFacts
): Promise<EffectResult> => {
  const { penId } = input.instance;
  // Work about no Pen counts no head: there is no register to set the count beside, and so nothing is recorded.
  if (!penId) {
    return null;
  }
  const { differs } = await recordHeadCount(tx, {
    farmId: input.instance.farmId,
    penId,
    instanceId: input.instance.id,
    completionId: input.completionId,
    counted: numberIn(input.step, input.evidence),
    countedAt: input.recordedAt,
    countedBy: input.recordedBy,
    now: input.now,
  });
  return { kind: "head_count", differs };
};

/** A Step that counts a Pen's head. */
export const headCountEffect: EffectKind<HeadCountFacts> = {
  kind: "head_count",
  apply: countThePen,
};

import type { Tx } from "../audit";
import { rederivePregnancy } from "../breeding-store";
import type { EffectInput } from "./effect";

/** What working her pregnancy out again needs from the Step that changed it. */
export type RederiveFacts = Pick<
  EffectInput,
  "pregnancyTimes" | "recordedAt" | "now" | "trail"
>;

/**
 * Works her pregnancy out again after something under it changed. Only the caller knows whether that
 * change was a positive being put right.
 */
export const rederiveFor = (
  tx: Tx,
  input: RederiveFacts,
  cowId: string,
  undoingPositive: boolean
) =>
  rederivePregnancy(tx, cowId, {
    times: input.pregnancyTimes,
    at: input.recordedAt,
    now: input.now,
    undoingPositive,
    trail: input.trail,
  });

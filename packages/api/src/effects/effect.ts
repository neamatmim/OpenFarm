import type { STEP_EFFECT_KINDS } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "../audit";
import type { EffectInput, EffectResult } from "../effects";
import { runStepEffect } from "../effects";
import { calvingEffect } from "./calving";
import { dryOffEffect } from "./dry-off";
import { moveEffect } from "./move";

/** Why an Effect stood aside: what the farm has learned since that the Step does not know. */
export type StandingAsideBecause =
  /** She has been walked on since the Step walked her. */
  | "moved_since"
  /** Corrected to a skip, but she cannot be put back in milk from here. */
  | "cannot_return_to_milk"
  /** Corrected in a way the farm has already acted on: a calf added, taken away, or since gone. */
  | "calving_acted_on";

/**
 * An Effect the farm has moved past (the glossary's Effect, standing aside): it wrote nothing over the newer fact, and
 * says why. A Step arriving so is a late Entry, kept for a person; a Correction so is kept and raised as Needs Review.
 */
export interface StandingAside {
  because: StandingAsideBecause;
  /** What the Manager is shown about it, beside the work it is about. */
  params?: Record<string, unknown>;
}

/**
 * One kind of Step Effect: the facts it needs from the Step, and how it writes them into the farm's records — or stands
 * aside when the farm has moved past them.
 */
export interface EffectKind<Facts> {
  kind: (typeof STEP_EFFECT_KINDS)[number];
  apply: (tx: Tx, facts: Facts) => Promise<EffectResult>;
}

/** The kinds that are their own modules; the rest are still written in effects.ts. */
const EFFECTS: Partial<
  Record<(typeof STEP_EFFECT_KINDS)[number], EffectKind<EffectInput>>
> = {
  [moveEffect.kind]: moveEffect,
  [dryOffEffect.kind]: dryOffEffect,
  [calvingEffect.kind]: calvingEffect,
};

/**
 * Runs the Effect a Step declares, inside the Completion's own transaction: if it fails, the Completion and its Audit
 * Event fail with it. Keyed on the Completion, so a Correction replaces what it wrote rather than adding to it.
 */
export const runEffect = (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  // Only a Step that writes a Milk Record has anywhere for milk to go. A tank reading filed as "calves" would be nonsense
  // the record then has to carry.
  if (input.destination && input.step.effect?.kind !== "milk_record") {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step does not record where the milk went",
    });
  }
  const kind = input.step.effect && EFFECTS[input.step.effect.kind];
  return kind ? kind.apply(tx, input) : runStepEffect(tx, input);
};

/** Whether an Effect stood aside, and why. */
export const stoodAside = (result: EffectResult): StandingAside | null =>
  result && "standsAside" in result ? result.standsAside : null;

/** What a person is told of a Step refused as late because its Effect stood aside. */
export const STANDING_ASIDE_SAID: Record<StandingAsideBecause, string> = {
  moved_since: "She has been moved since this was done",
  cannot_return_to_milk: "She cannot be put back in milk from here",
  calving_acted_on: "The farm has acted on this calving since",
};

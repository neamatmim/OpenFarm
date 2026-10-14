import {
  BODY_CONDITION,
  asksBodyConditionIn,
  bodyConditionSlot,
} from "@OpenFarm/domain";
import type { Step } from "@OpenFarm/domain";

import { answersFixed } from "./sop-draft";

/** Whether she has put flesh on since she was judged before, lost it, or held it — nothing with fewer than two. */
export const conditionChange = (
  /** Her judgments, the latest first. Missing from an answer this phone kept from before her page said them. */
  readings?: readonly { score: number }[]
): "up" | "down" | "same" | null => {
  const [latest, before] = readings ?? [];
  if (!(latest && before)) {
    return null;
  }
  if (latest.score === before.score) {
    return "same";
  }
  return latest.score > before.score ? "up" : "down";
};

/**
 * Whether the Owner may add the Playbook's Body Condition to a Step: one walked animal by animal that does not ask it
 * yet — a procedure adopted before the Playbook asked it at Dry-off and Calving, or one of the farm's own. Offered even
 * where the Step's answers are its effect's own, since it is asked after them and the record never reads it.
 */
export const mayAskBodyCondition = (step: Step): boolean =>
  step.repeatPerAnimal && !asksBodyConditionIn(step);

/** The Step asking Body Condition after everything it asks already, in the Playbook's own words. */
export const withBodyConditionAsked = (step: Step): Step => ({
  ...step,
  evidence: [...step.evidence, BODY_CONDITION],
});

/** Whether one of a Step's answers after its first may be taken out: any of them, or on a Step whose answers are its
 *  effect's own, only the Body Condition added after them. */
export const mayTakeAnswerOut = (step: Step, at: number): boolean =>
  at > 0 && (!answersFixed(step) || bodyConditionSlot(step) === at);

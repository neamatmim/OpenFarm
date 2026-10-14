import type { Bilingual, Step } from "@OpenFarm/domain";
import {
  HELD_FOR_SALE,
  NOT_DUE_YET,
  WRITTEN_BY_MISTAKE,
  mayHoldForSale,
  mayPassAsNotDue,
  maySkip,
} from "@OpenFarm/domain";

/** What the walk knows of an animal that changes what she is offered: a phone's copy from before the farm said either
 *  has neither, and she is walked as any other. */
interface AsTheWalkSeesHer {
  /** The day a Campaign's last dose was given her, where it still covers her. */
  notDueSince?: string | null;
  /** She is Ready for Sale. */
  readyForSale?: boolean;
}

/**
 * The reasons this Step may be skipped with, as the phone can offer them — none, when it may not be
 * skipped at all, and none when the Playbook gave it no reasons.
 *
 * Both halves matter, and the second is why this is not just `maySkip`. A skip is chosen from the
 * Version's own reasons and there is no free box to type into, so a Step the Playbook wrote no reasons
 * for cannot be skipped from here whatever the rule allows — drawing its button would open a sheet
 * asking why with nothing to press. The seeded AI Step is exactly that: a service, which the rule lets
 * a Playbook make skippable, with no reasons against it.
 *
 * Answering with the reasons rather than with yes or no keeps the button and the sheet reading the same
 * list, so one cannot offer what the other has not got. An animal a Campaign's last dose still covers is offered the
 * farm's own word for her, first: not due, dosed already. One Ready for Sale, on a dose given one animal at a time, is
 * offered the farm's word for holding it till she is back to Fattening.
 */
export const skipReasonsOffered = (
  step: Pick<Step, "repeatPerAnimal" | "effect" | "skipReasons">,
  /** Putting an answer right, which may also say it was written by mistake. */
  correcting = false,
  /** The animal it is answered for, where one is. */
  animal?: AsTheWalkSeesHer
): Bilingual[] => {
  if (!maySkip(step)) {
    return [];
  }
  const own = correcting
    ? [...step.skipReasons, WRITTEN_BY_MISTAKE]
    : step.skipReasons;
  const held =
    animal?.readyForSale && mayHoldForSale(step) ? [HELD_FOR_SALE] : [];
  const covered =
    animal?.notDueSince && mayPassAsNotDue(step) ? [NOT_DUE_YET] : [];
  return [...covered, ...held, ...own];
};

/**
 * The farm's own word a new answer for her opens passed with, or nothing for an animal walked as any other: not due, where
 * a Campaign's last dose still covers her, so nobody doses her twice; else held, where she is Ready for Sale, so nobody
 * starts a withdrawal that holds up her sale. Either may still be given. A phone's copy from before the farm said either
 * walks her as any other.
 */
export const passedFirstWith = (
  step: Pick<Step, "repeatPerAnimal" | "effect">,
  animal?: AsTheWalkSeesHer
): string | null => {
  if (animal?.notDueSince && mayPassAsNotDue(step)) {
    return NOT_DUE_YET.bn;
  }
  if (animal?.readyForSale && mayHoldForSale(step)) {
    return HELD_FOR_SALE.bn;
  }
  return null;
};

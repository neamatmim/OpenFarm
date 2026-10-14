import type { Bilingual, SopContent, Step } from "@OpenFarm/domain";
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

/** Where a Step is answered: for which animal, in which Version. */
interface Answering {
  /** The animal it is answered for, where one is. */
  animal?: AsTheWalkSeesHer;
  /** The Version the Step is in: what raises it says whether a dose may be held for her sale. Without it, none is. */
  content?: Pick<SopContent, "triggers">;
}

/** Whether her dose on this Step is held for her sale: she is Ready for Sale, and the Step may hold it. */
export const heldHere = (
  step: Pick<Step, "repeatPerAnimal" | "effect">,
  { animal, content }: Answering
): boolean =>
  animal?.readyForSale === true &&
  content !== undefined &&
  mayHoldForSale(content, step);

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
 * offered the farm's word for holding it till she is back to Fattening. The same words are never offered twice.
 */
export const skipReasonsOffered = (
  step: Pick<Step, "repeatPerAnimal" | "effect" | "skipReasons">,
  {
    correcting = false,
    ...answering
  }: Answering & {
    /** Putting an answer right, which may also say it was written by mistake. */
    correcting?: boolean;
  } = {}
): Bilingual[] => {
  if (!maySkip(step)) {
    return [];
  }
  const own = correcting
    ? [...step.skipReasons, WRITTEN_BY_MISTAKE]
    : step.skipReasons;
  const covered =
    answering.animal?.notDueSince && mayPassAsNotDue(step) ? [NOT_DUE_YET] : [];
  const held = heldHere(step, answering) ? [HELD_FOR_SALE] : [];
  // A Version published before the farm refused its own reason worded as the farm's would list those words twice.
  return [...covered, ...held, ...own].filter(
    (reason, index, all) =>
      all.findIndex((one) => one.bn === reason.bn) === index
  );
};

/**
 * The farm's own word a new answer for her opens passed with, or nothing for an animal walked as any other: not due, where
 * a Campaign's last dose still covers her, so nobody doses her twice; else held, where she is Ready for Sale, so nobody
 * starts a withdrawal that holds up her sale. Either may still be given. A phone's copy from before the farm said either
 * walks her as any other.
 */
export const passedFirstWith = (
  step: Pick<Step, "repeatPerAnimal" | "effect">,
  answering: Answering
): string | null => {
  if (answering.animal?.notDueSince && mayPassAsNotDue(step)) {
    return NOT_DUE_YET.bn;
  }
  return heldHere(step, answering) ? HELD_FOR_SALE.bn : null;
};

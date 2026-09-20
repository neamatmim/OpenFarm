import type { Bilingual, Step } from "@OpenFarm/domain";
import { maySkip } from "@OpenFarm/domain";

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
 * list, so one cannot offer what the other has not got.
 */
export const skipReasonsOffered = (
  step: Pick<Step, "repeatPerAnimal" | "effect" | "skipReasons">
): Bilingual[] => (maySkip(step) ? step.skipReasons : []);

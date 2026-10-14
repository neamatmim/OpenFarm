import { describe, expect, it } from "vitest";

import { BODY_CONDITION, bodyConditionIn } from "./body-condition";
import type { Step } from "./sop";
import { findStructuralProblems } from "./sop";
import { standardPlaybook } from "./standard-playbook";

const playbook = standardPlaybook({ calvingPen: "calving-pen" });

/** A Step that asks a figure and then something chosen, as a weigh-in does. */
const weighing = (choices: string[]): Step => ({
  id: "weigh",
  text: { bn: "ওজন" },
  repeatPerAnimal: true,
  evidence: [
    { type: "number", required: true },
    {
      type: "choice",
      required: false,
      choices: choices.map((value) => ({ value, label: { bn: value } })),
    },
  ],
  skipReasons: [],
  effect: { kind: "weigh_in" },
});

describe("Body Condition", () => {
  it("is asked, never insisted on, at the weigh-ins, at dry-off and at calving", () => {
    for (const procedure of [
      playbook.weighIn,
      playbook.heiferWeighIn,
      playbook.dryOff,
      playbook.calvingRecord,
    ]) {
      const [step] = procedure.steps;
      expect(step?.evidence).toContainEqual(BODY_CONDITION);
      expect(BODY_CONDITION.required).toBe(false);
      expect(findStructuralProblems(procedure)).toEqual([]);
    }
  });

  it("is read from whichever slot asks it, as the score chosen", () => {
    const [weigh] = playbook.weighIn.steps;
    const [dry] = playbook.dryOff.steps;
    const [calved] = playbook.calvingRecord.steps;
    if (!(weigh && dry && calved)) {
      throw new Error("expected the standard Steps");
    }
    expect(bodyConditionIn(weigh, [214, "2"])).toBe(2);
    expect(bodyConditionIn(dry, [true, "4"])).toBe(4);
    const answered = Array.from({ length: calved.evidence.length }, () => "");
    answered[calved.evidence.length - 1] = "3";
    expect(bodyConditionIn(calved, answered)).toBe(3);
  });

  it("is nothing where nobody judged her, or the Step does not ask it", () => {
    const [weigh] = playbook.weighIn.steps;
    const [milk] = playbook.morningMilking.steps;
    if (!(weigh && milk)) {
      throw new Error("expected the standard Steps");
    }
    expect(bodyConditionIn(weigh, [214])).toBeNull();
    expect(bodyConditionIn(weigh, [214, ""])).toBeNull();
    expect(bodyConditionIn(milk, [5])).toBeNull();
  });

  it("is a choice of the five scores exactly: another scale is not read as it", () => {
    expect(
      bodyConditionIn(weighing(["1", "2", "3", "4", "5"]), [200, "5"])
    ).toBe(5);
    expect(bodyConditionIn(weighing(["1", "2", "3"]), [200, "3"])).toBeNull();
    expect(
      bodyConditionIn(weighing(["1", "2", "3", "4", "5", "6"]), [200, "3"])
    ).toBeNull();
  });
});

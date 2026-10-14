import { describe, expect, it } from "vitest";

import type { BodyConditionScore } from "./body-condition";
import {
  BODY_CONDITION,
  bodyConditionIn,
  bodyConditionWords,
  judgedAtOf,
} from "./body-condition";
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

  it("is said on every screen in the words the phone asked it in", () => {
    for (const choice of BODY_CONDITION.choices ?? []) {
      expect(
        bodyConditionWords(Number(choice.value) as BodyConditionScore)
      ).toEqual(choice.label);
    }
    expect(bodyConditionWords(1)).toEqual({
      bn: "১ — খুব রোগা",
      en: "1 — very thin",
    });
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

  it("is not any one-to-five choice: an Owner's lameness score typed 1, 2, 3, 4, 5 is not read as it", () => {
    // The editor takes a typed word as its value, so the values are "1" to "5" — and the words above them are the
    // Owner's own, not the Playbook's.
    expect(
      bodyConditionIn(weighing(["1", "2", "3", "4", "5"]), [200, "2"])
    ).toBeNull();
    expect(bodyConditionIn(weighing(["1", "2", "3"]), [200, "3"])).toBeNull();
  });

  it("is the Playbook's slot as it was written before it carried its mark, read for the scores already given", () => {
    const { means: _means, ...unmarked } = BODY_CONDITION;
    const before: Step = {
      ...weighing([]),
      evidence: [{ type: "number", required: true }, unmarked],
    };
    expect(bodyConditionIn(before, [200, "4"])).toBe(4);
    // Reworded or with a score added, it is somebody's own scale, and not read as the Playbook's.
    const reworded: Step = {
      ...before,
      evidence: [
        { type: "number", required: true },
        {
          ...unmarked,
          choices: (unmarked.choices ?? []).map((one) => ({
            ...one,
            label: { bn: one.value },
          })),
        },
      ],
    };
    expect(bodyConditionIn(reworded, [200, "4"])).toBeNull();
  });

  it("is marked, and a slot marked so that does not offer the five scores is refused publishing", () => {
    expect(BODY_CONDITION.means).toBe("body_condition");
    const [weigh] = playbook.weighIn.steps;
    if (!weigh) {
      throw new Error("expected the standard Step");
    }
    const wrong = {
      ...playbook.weighIn,
      steps: [
        {
          ...weigh,
          evidence: [
            { type: "number" as const, required: true, min: 20, max: 1200 },
            {
              ...BODY_CONDITION,
              choices: (BODY_CONDITION.choices ?? []).slice(0, 3),
            },
          ],
        },
      ],
    };
    expect(findStructuralProblems(wrong)).toEqual([
      "steps[0].evidence[1]: body condition is asked as the five scores, one to five",
    ]);
  });
});

describe("the moment she was judged", () => {
  const [calved] = playbook.calvingRecord.steps;
  const [weigh] = playbook.weighIn.steps;
  if (!(calved && weigh)) {
    throw new Error("expected the standard Steps");
  }
  const written = new Date("2027-03-04T07:30:00.000Z");

  it("is when she calved, where the Step says when it happened", () => {
    expect(
      judgedAtOf(calved, ["2027-03-04T02:10:00.000Z", "unassisted"], written)
    ).toEqual(new Date("2027-03-04T02:10:00.000Z"));
  });

  it("is when it was written, where the Step says no time of its own or says none that can be read", () => {
    expect(judgedAtOf(weigh, [214, "3"], written)).toEqual(written);
    expect(judgedAtOf(calved, ["", "unassisted"], written)).toEqual(written);
  });
});

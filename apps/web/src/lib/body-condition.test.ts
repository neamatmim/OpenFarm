import { BODY_CONDITION, standardPlaybook } from "@OpenFarm/domain";
import type { Step } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import {
  conditionChange,
  mayAskBodyCondition,
  withBodyConditionAsked,
  mayTakeAnswerOut,
} from "./body-condition";

const reading = (score: number, day: string) => ({
  score,
  judgedAt: new Date(`${day}T07:30:00.000Z`),
});

describe("her Body Condition over time", () => {
  it("says whether she has put flesh on or lost it since she was judged before", () => {
    expect(
      conditionChange([reading(3, "2027-02-16"), reading(2, "2027-02-02")])
    ).toBe("up");
    expect(
      conditionChange([reading(2, "2027-02-16"), reading(4, "2027-02-02")])
    ).toBe("down");
    expect(
      conditionChange([reading(3, "2027-02-16"), reading(3, "2027-02-02")])
    ).toBe("same");
  });

  it("says nothing with one judgment, or none — an answer kept from before her page said it included", () => {
    expect(conditionChange([reading(3, "2027-02-16")])).toBeNull();
    expect(conditionChange([])).toBeNull();
    expect(conditionChange()).toBeNull();
  });
});

/** A standard Step as a farm adopted it before the Playbook asked Body Condition: without the score. */
const before = (step: Step): Step => ({
  ...step,
  evidence: step.evidence.slice(0, -1),
});

describe("asking Body Condition in a procedure the farm adopted before the Playbook asked it", () => {
  const playbook = standardPlaybook({ calvingPen: "calving-pen" });
  const [dry] = playbook.dryOff.steps;
  const [calved] = playbook.calvingRecord.steps;
  if (!(dry && calved)) {
    throw new Error("expected the standard Steps");
  }
  it("adds the Playbook's own slot after what the Step asks, once", () => {
    const asked = withBodyConditionAsked(before(dry));
    expect(asked.evidence).toEqual([
      { type: "tick", required: true },
      BODY_CONDITION,
    ]);
    expect(mayAskBodyCondition(asked)).toBe(false);
    expect(mayAskBodyCondition(before(dry))).toBe(true);
  });

  it("is offered on a Step whose answers are its effect's own, as a calving's are, and may be taken out again there", () => {
    const old = before(calved);
    expect(mayAskBodyCondition(old)).toBe(true);
    const asked = withBodyConditionAsked(old);
    const at = asked.evidence.length - 1;
    expect(mayTakeAnswerOut(asked, at)).toBe(true);
    // The calving's own answers stay where the record reads them.
    expect(mayTakeAnswerOut(asked, 1)).toBe(false);
  });

  it("is not offered on a Step done once for the whole Pen: a Pen has no flesh", () => {
    const [feed] = playbook.feeding.steps;
    if (!feed) {
      throw new Error("expected the feeding Step");
    }
    expect(mayAskBodyCondition(feed)).toBe(false);
  });
});

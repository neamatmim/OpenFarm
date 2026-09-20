import type { Step } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { skipReasonsOffered } from "./skipping";

/** Only the facts the question reads. */
const aStep = (
  step: Partial<Pick<Step, "repeatPerAnimal" | "effect" | "skipReasons">>
): Pick<Step, "repeatPerAnimal" | "effect" | "skipReasons"> => ({
  repeatPerAnimal: false,
  skipReasons: [],
  ...step,
});

const outOfTheMedicine = { bn: "ওষুধ শেষ", en: "Out of the medicine" };
const notFound = { bn: "পশু পাওয়া যায়নি", en: "Animal not found" };

describe("what the phone may offer to skip a Step with", () => {
  it("offers the Playbook's reasons for a dose done once for the Pen", () => {
    // The seeded dose Step, which the phone drew no button for at all until the rule was shared.
    const reasons = skipReasonsOffered(
      aStep({
        effect: { kind: "treatment" },
        skipReasons: [notFound, outOfTheMedicine],
      })
    );
    expect(reasons).toEqual([notFound, outOfTheMedicine]);
  });

  it("offers the animal's reasons for a Step done animal by animal", () => {
    expect(
      skipReasonsOffered(
        aStep({ repeatPerAnimal: true, skipReasons: [notFound] })
      )
    ).toEqual([notFound]);
  });

  it("offers nothing for a Step the Playbook wrote no reasons against", () => {
    // The seeded service Step. The rule lets a Playbook make a service skippable, but this one says
    // nothing a person could choose, so the button must not be drawn over an empty sheet.
    expect(
      skipReasonsOffered(
        aStep({ effect: { kind: "service" }, skipReasons: [] })
      )
    ).toEqual([]);
  });

  it("offers nothing for a Step that may not be skipped, reasons or not", () => {
    expect(
      skipReasonsOffered(
        aStep({ effect: { kind: "milk_record" }, skipReasons: [notFound] })
      )
    ).toEqual([]);
    expect(skipReasonsOffered(aStep({ skipReasons: [notFound] }))).toEqual([]);
  });
});

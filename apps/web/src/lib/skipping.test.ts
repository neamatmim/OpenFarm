import type { Step } from "@OpenFarm/domain";
import { HELD_FOR_SALE, NOT_DUE_YET } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { passedFirstWith, skipReasonsOffered } from "./skipping";

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

describe("an animal Ready for Sale on a dose given one animal at a time", () => {
  const unwell = {
    bn: "অসুস্থ — পরে দেওয়া হবে",
    en: "Unwell — to be given later",
  };
  const campaignDose = aStep({
    repeatPerAnimal: true,
    effect: { kind: "treatment", productId: "fmd" },
    skipReasons: [unwell],
  });

  it("is offered the farm's word for holding her, whatever the Version's own reasons", () => {
    expect(
      skipReasonsOffered(campaignDose, false, { readyForSale: true }).map(
        (one) => one.bn
      )
    ).toEqual([HELD_FOR_SALE.bn, unwell.bn]);
    // Covered as well: not due first, the better word.
    expect(
      skipReasonsOffered(campaignDose, false, {
        readyForSale: true,
        notDueSince: "2026-09-01",
      }).map((one) => one.bn)
    ).toEqual([NOT_DUE_YET.bn, HELD_FOR_SALE.bn, unwell.bn]);
  });

  it("is not offered it when she is not Ready for Sale, nor on a Prescription's dose", () => {
    expect(
      skipReasonsOffered(campaignDose, false, { readyForSale: false })
    ).toEqual([unwell]);
    // A phone's copy from before the farm said whether she is ready.
    expect(skipReasonsOffered(campaignDose, false, {})).toEqual([unwell]);
    const prescribed = aStep({
      effect: { kind: "treatment" },
      skipReasons: [notFound],
    });
    expect(
      skipReasonsOffered(prescribed, false, { readyForSale: true })
    ).toEqual([notFound]);
  });

  it("opens passed as held for her sale, and passed as not due where her last dose still covers her", () => {
    expect(passedFirstWith(campaignDose, { readyForSale: true })).toBe(
      HELD_FOR_SALE.bn
    );
    // Not due is the better word: she is owed nothing later at all.
    expect(
      passedFirstWith(campaignDose, {
        readyForSale: true,
        notDueSince: "2026-09-01",
      })
    ).toBe(NOT_DUE_YET.bn);
    expect(passedFirstWith(campaignDose, { readyForSale: false })).toBeNull();
    // A phone's copy from before the farm said whether she is ready: she is walked as any other.
    expect(passedFirstWith(campaignDose, {})).toBeNull();
    expect(passedFirstWith(campaignDose)).toBeNull();
  });
});

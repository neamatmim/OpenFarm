import type { Step, StepEffect } from "@OpenFarm/domain";
import {
  STEP_EFFECT_KINDS,
  describeChanges,
  findPublishBlockers,
} from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import {
  emptySop,
  emptyStep,
  freshStepId,
  reworded,
  sameList,
  toChoices,
  withEffect,
  withFirstEvidence,
  withScheduleTimes,
} from "./sop-draft";

// What may be chosen, as the Owner edits it: a record points at a choice's value, so a value must stay with the choice
// it was given to — whatever is reworded, taken out or moved around it.

const round = [
  { value: "heat", label: { bn: "গরম হয়েছে" } },
  { value: "lame", label: { bn: "খোঁড়াচ্ছে" } },
  { value: "off_feed", label: { bn: "খাবারে অরুচি" } },
];

describe("the choices of a Step, edited", () => {
  it("keeps each value with its own choice when one is taken out", () => {
    // Taking out "খোঁড়াচ্ছে" must not hand "খাবারে অরুচি" the value `lame`.
    expect(toChoices("গরম হয়েছে, খাবারে অরুচি", round)).toEqual([
      round[0],
      round[2],
    ]);
    // Taking out "গরম হয়েছে" must not make a lame sighting a heat.
    expect(
      toChoices("খোঁড়াচ্ছে, খাবারে অরুচি", round).map((one) => one.value)
    ).toEqual(["lame", "off_feed"]);
  });

  it("keeps each value with its own choice when they are moved around", () => {
    expect(
      toChoices("খাবারে অরুচি, গরম হয়েছে, খোঁড়াচ্ছে", round).map((one) => one.value)
    ).toEqual(["off_feed", "heat", "lame"]);
  });

  it("keeps a choice's value when only its words change, and gives a new choice its own", () => {
    expect(toChoices("গরম হয়েছে, খোঁড়ায়, খাবারে অরুচি", round)[1]).toEqual({
      value: "lame",
      label: { bn: "খোঁড়ায়" },
    });
    expect(toChoices("গরম হয়েছে, খোঁড়াচ্ছে, খাবারে অরুচি, কাশি", round)[3]).toEqual({
      value: "কাশি",
      label: { bn: "কাশি" },
    });
  });
});

describe("a Step's first Evidence, edited", () => {
  it("keeps the Evidence after it: raising a weigh-in's most kilos does not drop its condition score", () => {
    const weighIn = {
      id: "weigh",
      text: { bn: "ওজন নিন" },
      repeatPerAnimal: true,
      evidence: [
        { type: "number" as const, required: true, min: 20, max: 1200 },
        {
          type: "choice" as const,
          required: false,
          choices: [{ value: "3", label: { bn: "৩" } }],
        },
      ],
      skipReasons: [],
    };
    const raised = withFirstEvidence(weighIn, {
      ...weighIn.evidence[0],
      max: 1500,
    });
    expect(raised.evidence).toEqual([
      { type: "number", required: true, min: 20, max: 1500 },
      weighIn.evidence[1],
    ]);
  });
});

describe("a list as it is being typed", () => {
  it("is the same list with a comma just typed after it, so the box keeps the comma", () => {
    expect(sameList("05:00,", "05:00")).toBe(true);
    expect(sameList("05:00, 17:00", "05:00")).toBe(false);
  });
});

const PENS = [{ id: "pen-1", name: "শেড ১" }];

/** A blank Step given an effect, with what the Owner then fills in by hand — the Bangla, a unit, something to choose. */
const filledIn = (kind: StepEffect["kind"]): Step => {
  const step = withEffect(emptyStep("s"), kind, PENS);
  return {
    ...step,
    text: { bn: "ধাপ" },
    evidence: step.evidence.map((one) => ({
      ...one,
      ...(one.type === "number" ? { unit: { bn: "একক" } } : {}),
      ...(one.type === "choice" && (one.choices?.length ?? 0) === 0
        ? { choices: [{ value: "x", label: { bn: "এক" } }] }
        : {}),
    })),
  };
};

/** The effects whose Step is refused for what the rest of the procedure lacks, not for what the editor made of it. */
const NEEDS_THE_REST: ReadonlySet<string> = new Set(["lot_number"]);

describe("a Step given an effect in the editor", () => {
  it("is walked as its effect is done — once for a feeding, a store count, a renewal — so it can be published", () => {
    const refused = STEP_EFFECT_KINDS.filter(
      (kind) => !NEEDS_THE_REST.has(kind)
    ).flatMap((kind) =>
      findPublishBlockers({
        ...emptySop(),
        name: { bn: "নাম" },
        purpose: { bn: "কেন" },
        steps: [filledIn(kind)],
      })
        .filter((blocker) => blocker.startsWith("steps[0]"))
        .map((blocker) => `${kind} — ${blocker}`)
    );
    expect(refused).toEqual([]);
  });

  it("asks nothing its old effect asked: a service turned milk record asks for litres alone", () => {
    const served = withEffect(emptyStep("s"), "service", PENS);
    expect(served.evidence.length).toBeGreaterThan(1);
    const milked = withEffect(served, "milk_record", PENS);
    expect(milked.evidence.map((one) => one.type)).toEqual(["number"]);
    expect(withEffect(served, "", PENS).evidence).toEqual([
      { type: "tick", required: true },
    ]);
  });

  it("changes nothing when the effect it has is chosen again", () => {
    const counted = { ...filledIn("head_count"), skipReasons: [{ bn: "কারণ" }] };
    expect(withEffect(counted, "head_count", PENS)).toBe(counted);
  });
});

describe("a procedure's times, emptied", () => {
  it("is raised by hand, not left with a schedule of no times the farm refuses", () => {
    const content = withScheduleTimes(
      {
        ...emptySop(),
        name: { bn: "কৃমিনাশক" },
        purpose: { bn: "কেন" },
        steps: [{ ...emptyStep("s"), text: { bn: "দিন" } }],
      },
      []
    );
    expect(content.triggers).toEqual([]);
    expect(findPublishBlockers(content)).toEqual([]);
  });
});

describe("words in Bangla rewritten", () => {
  it("lose the English that said the old words, and keep it while they are unchanged", () => {
    const heat = { bn: "গরম হয়েছে", en: "In heat" };
    expect(reworded(heat, "খোঁড়া")).toEqual({ bn: "খোঁড়া" });
    expect(reworded(heat, "গরম হয়েছে")).toBe(heat);
    const [first] = toChoices("খোঁড়া, খাবারে অরুচি", [
      { value: "heat", label: heat },
      { value: "off_feed", label: { bn: "খাবারে অরুচি" } },
    ]);
    expect(first?.label).toEqual({ bn: "খোঁড়া" });
  });
});

describe("a new choice's value", () => {
  it("is never longer than the farm keeps, and never one another choice holds", () => {
    const long = "নাক দিয়ে পানি পড়ছে আর সকাল থেকে ঘন ঘন কাশি হচ্ছে";
    const choices = toChoices(`${long}, ${long} আরও`);
    for (const choice of choices) {
      expect(choice.value.length).toBeLessThanOrEqual(40);
    }
    expect(new Set(choices.map((one) => one.value)).size).toBe(2);
  });
});

describe("a Step added after one is taken out", () => {
  it("is listed as a Step added and one taken out, not as the old Step reworded", () => {
    const before = {
      ...emptySop(),
      steps: [
        { ...emptyStep("step-1"), text: { bn: "পানি দিন" } },
        { ...emptyStep("step-2"), text: { bn: "টিকা দিন" } },
      ],
    };
    const kept = before.steps.slice(0, 1);
    const after = {
      ...before,
      steps: [
        ...kept,
        { ...emptyStep(freshStepId(kept)), text: { bn: "পাত্র ধুয়ে দিন" } },
      ],
    };
    expect(
      describeChanges(before, after)
        .map((one) => one.kind)
        .toSorted()
    ).toEqual(["step_added", "step_removed"]);
  });
});

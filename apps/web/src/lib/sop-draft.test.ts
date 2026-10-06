import { describe, expect, it } from "vitest";

import { sameList, toChoices, withFirstEvidence } from "./sop-draft";

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
    expect(toChoices("গরমে এসেছে, খোঁড়াচ্ছে, খাবারে অরুচি", round)[0]).toEqual({
      value: "heat",
      label: { bn: "গরমে এসেছে" },
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

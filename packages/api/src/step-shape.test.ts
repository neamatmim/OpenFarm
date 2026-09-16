import type { Bilingual, Step, StepShape, WordsFor } from "@OpenFarm/domain";
import {
  CALVING_STEP,
  DLS_REPORT_STEP,
  LOT_NUMBER_STEP,
  PREGNANCY_CHECK_STEP,
  SERVICE_STEP,
  draftFrom,
  problemsAgainst,
  slotsOf,
} from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

// What a shaped Step asks for is said once, and three readers take it from there: publishing checks a Step
// against it, the phone drafts from it, and an Effect reads a slot by name. These are about the first two
// agreeing — the thing that used to be written out twice and checked once.

/** The farm's own words for each choice, whatever they are: these tests are about the shape, not the wording. */
const anyWords = (shape: StepShape): WordsFor<StepShape> =>
  Object.fromEntries(
    slotsOf(shape).flatMap(({ slot }) =>
      slot.kind === "choice"
        ? slot.values.map((value): [string, Bilingual] => [
            value,
            { bn: value },
          ])
        : []
    )
  );

const stepOf = (shape: StepShape): Step => ({
  id: "one",
  text: { bn: "ধাপ" },
  repeatPerAnimal: false,
  evidence: draftFrom(shape, anyWords(shape)),
  skipReasons: [],
});

const SHAPES = {
  service: SERVICE_STEP,
  calving: CALVING_STEP,
  pregnancy_check: PREGNANCY_CHECK_STEP,
  dls_report: DLS_REPORT_STEP,
  lot_number: LOT_NUMBER_STEP,
} as const;

describe("what a shaped Step asks for", () => {
  it("is drafted by the phone as the rule publishing applies would have it", () => {
    for (const [named, shape] of Object.entries(SHAPES)) {
      expect([
        named,
        problemsAgainst(shape, stepOf(shape), "steps[0]"),
      ]).toEqual([named, []]);
    }
  });

  it("puts the calves after when she calved and how it went, two slots to each", () => {
    expect(
      slotsOf(CALVING_STEP).map(({ slot, at, required }) => [
        slot.name,
        at,
        required,
      ])
    ).toEqual([
      ["calvedAt", 0, true],
      ["ease", 1, true],
      ["sex", 2, true],
      ["outcome", 3, true],
      // Twins and, rarely, triplets are one calving; the farm leaves their slots empty when there was one calf.
      ["sex", 4, false],
      ["outcome", 5, false],
      ["sex", 6, false],
      ["outcome", 7, false],
    ]);
  });

  it("says what is missing where, in the words an Owner reads", () => {
    const wrong = stepOf(SERVICE_STEP);
    // A Step that asks for the sire as a tick rather than a note, and offers a method the record cannot read.
    wrong.evidence[1] = { type: "tick", required: true };
    wrong.evidence[0] = {
      type: "choice",
      required: true,
      choices: [{ value: "somehow", label: { bn: "যেভাবে হোক" } }],
    };

    expect(problemsAgainst(SERVICE_STEP, wrong, "steps[3]")).toEqual([
      'steps[3].evidence[0]: a service step first asks how she was served, offering "ai" and "natural"',
      "steps[3].evidence[1]: a service step then asks for the sire, as a required note",
    ]);
  });

  it("refuses a draft the farm has no words for", () => {
    expect(() =>
      draftFrom(SERVICE_STEP, {
        ai: { bn: "কৃত্রিম প্রজনন" },
      } as WordsFor<typeof SERVICE_STEP>)
    ).toThrow(/no words for the choice "natural"/u);
  });
});

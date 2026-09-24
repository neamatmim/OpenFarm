import { describe, expect, it } from "vitest";

import type { Step } from "./sop";
import {
  describeChanges,
  findStructuralProblems,
  maySkip,
  missingEvidence,
} from "./sop";
import { standardPlaybook } from "./standard-playbook";

// Which Steps may be skipped is asked by two readers — the server, refusing a skip it does not allow,
// and the phone, deciding whether to draw the button at all. They used to answer differently. These are
// about the answer they now share.

/** A Step done once for the whole Pen, carrying the Effect named. */
const doneOnce = (
  effect?: Step["effect"]
): Pick<Step, "repeatPerAnimal" | "effect"> => ({
  repeatPerAnimal: false,
  effect,
});

/** A Step done at each animal in turn. */
const doneAtEachAnimal = (
  effect?: Step["effect"]
): Pick<Step, "repeatPerAnimal" | "effect"> => ({
  repeatPerAnimal: true,
  effect,
});

describe("which Steps may be skipped", () => {
  it("lets a Step done at each animal skip the animal, whatever it does", () => {
    expect(maySkip(doneAtEachAnimal())).toBe(true);
    expect(maySkip(doneAtEachAnimal({ kind: "milk_record" }))).toBe(true);
  });

  it("lets a dose be skipped though it is done once for the Pen", () => {
    // The seeded Playbook's own dose Step, which the farm wrote "ওষুধ শেষ" against and nobody on a
    // phone could choose while the screen read repeatPerAnimal alone.
    expect(maySkip(doneOnce({ kind: "treatment" }))).toBe(true);
  });

  it("lets a service be skipped, for the heat that did not need a second one", () => {
    expect(maySkip(doneOnce({ kind: "service" }))).toBe(true);
  });

  it("refuses a Step that is neither, so a milking is not skipped by saying so", () => {
    expect(maySkip(doneOnce())).toBe(false);
    expect(maySkip(doneOnce({ kind: "milk_record" }))).toBe(false);
    expect(maySkip(doneOnce({ kind: "bulk_total" }))).toBe(false);
    expect(maySkip(doneOnce({ kind: "weigh_in" }))).toBe(false);
  });
});

/** A Step asking for exactly the slots named, in that order. */
const asking = (
  ...evidence: { type: Step["evidence"][number]["type"]; required: boolean }[]
): Pick<Step, "evidence"> => ({ evidence });

const noPhotos = () => false;

describe("what a Step is still missing", () => {
  it("counts a required note filled with spaces as unfilled", () => {
    // The farm has always refused this. The phone used to offer the button for it, because it asked
    // whether the box was empty rather than whether anything had been said in it.
    expect(
      missingEvidence(
        asking({ type: "note", required: true }),
        ["  "],
        noPhotos
      )
    ).toEqual([0]);
    expect(
      missingEvidence(
        asking({ type: "note", required: true }),
        ["ঠিক আছে"],
        noPhotos
      )
    ).toEqual([]);
  });

  it("asks per slot, not by count", () => {
    // An optional note and a required number: filling only the note satisfies nothing.
    const step = asking(
      { type: "note", required: false },
      { type: "number", required: true }
    );
    expect(missingEvidence(step, ["said", ""], noPhotos)).toEqual([1]);
  });

  it("takes a tick that was ticked, and false is an answer", () => {
    expect(
      missingEvidence(
        asking({ type: "tick", required: true }),
        [true],
        noPhotos
      )
    ).toEqual([]);
    expect(
      missingEvidence(
        asking({ type: "tick", required: true }),
        [false],
        noPhotos
      )
    ).toEqual([]);
  });

  it("looks for a photograph where one is asked for, not in the answers", () => {
    const step = asking({ type: "photo", required: true });
    expect(missingEvidence(step, [""], noPhotos)).toEqual([0]);
    expect(missingEvidence(step, [""], () => true)).toEqual([]);
  });

  it("asks nothing of a slot the Version did not require", () => {
    expect(
      missingEvidence(asking({ type: "note", required: false }), [""], noPhotos)
    ).toEqual([]);
  });
});

describe("work about the whole farm", () => {
  const { biosecurity } = standardPlaybook();

  it("is the farm's one biosecurity check, and publishes as it is", () => {
    expect(biosecurity.wholeFarm).toBe(true);
    expect(findStructuralProblems(biosecurity)).toEqual([]);
  });

  it("walks no Pen, so no Step of it repeats at each animal", () => {
    const [first, ...rest] = biosecurity.steps;
    if (!first) {
      throw new Error("the biosecurity check has steps");
    }
    const problems = findStructuralProblems({
      ...biosecurity,
      steps: [{ ...first, repeatPerAnimal: true }, ...rest],
    });

    expect(problems.join(" ")).toContain("walked once");
  });

  it("is raised by the clock, not by something that happened to an animal in a Pen", () => {
    const problems = findStructuralProblems({
      ...biosecurity,
      triggers: [{ kind: "event", event: "arrival" }],
    });

    expect(problems.join(" ")).toContain("raised by the clock");
  });

  it("is a change the people doing the work are told of, either way", () => {
    const perPen = { ...biosecurity, wholeFarm: undefined };

    expect(describeChanges(perPen, biosecurity)).toContainEqual({
      kind: "now_whole_farm",
    });
    expect(describeChanges(biosecurity, perPen)).toContainEqual({
      kind: "now_per_pen",
    });
  });
});

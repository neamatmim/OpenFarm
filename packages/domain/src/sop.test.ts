import { describe, expect, it } from "vitest";

import type { Step } from "./sop";
import { maySkip } from "./sop";

/** A Step with only the facts the rule reads. */
const step = (
  repeatPerAnimal: boolean,
  effect?: Step["effect"]
): Pick<Step, "repeatPerAnimal" | "effect"> => ({ repeatPerAnimal, effect });

describe("which Steps may be skipped", () => {
  it("lets a per-animal Step skip the animal, whatever it does", () => {
    expect(maySkip(step(true))).toBe(true);
    expect(maySkip(step(true, { kind: "milk_record" }))).toBe(true);
  });

  it("lets a dose be skipped though it is done once for the pen", () => {
    // The seeded Playbook's own dose Step: not per-animal, and written with the reasons
    // "ওষুধ শেষ" and "পশু পাওয়া যায়নি" — which nobody could choose while the phone read
    // repeatPerAnimal alone.
    expect(maySkip(step(false, { kind: "treatment" }))).toBe(true);
  });

  it("lets a service be skipped, for the heat that did not need a second one", () => {
    expect(maySkip(step(false, { kind: "service" }))).toBe(true);
  });

  it("refuses a Step that is neither, so a milking is not skipped by saying so", () => {
    expect(maySkip(step(false))).toBe(false);
    expect(maySkip(step(false, { kind: "milk_record" }))).toBe(false);
    expect(maySkip(step(false, { kind: "bulk_total" }))).toBe(false);
    expect(maySkip(step(false, { kind: "weigh_in" }))).toBe(false);
  });
});

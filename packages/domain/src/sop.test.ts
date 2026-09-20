import { describe, expect, it } from "vitest";

import type { Step } from "./sop";
import { maySkip } from "./sop";

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

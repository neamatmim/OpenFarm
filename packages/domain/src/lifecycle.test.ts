import { describe, expect, it } from "vitest";

import { statesSetByHand } from "./lifecycle";

// What her page offers under "change her State": only what the farm takes as a bare State. Sold, died and culled
// are the end of a record of their own, and Ready for Sale is confirmed against her Withdrawals — offered here, they
// were choices the farm refused every time.

describe("the States a person may set her to by hand", () => {
  it("moves a dairy cow along her own cycle", () => {
    expect(statesSetByHand("milking")).toEqual(["dry"]);
    expect(statesSetByHand("dry")).toEqual(["milking"]);
    expect(statesSetByHand("pregnant_heifer")).toEqual(["milking", "heifer"]);
  });

  it("takes a bull out of quarantine, and nowhere else", () => {
    expect(statesSetByHand("quarantine")).toEqual(["fattening"]);
  });

  it("offers a Fattening bull nothing: ready, sold and gone each have their own record", () => {
    expect(statesSetByHand("fattening")).toEqual([]);
  });

  it("offers nothing for one that has left the farm", () => {
    expect(statesSetByHand("sold")).toEqual([]);
    expect(statesSetByHand("died")).toEqual([]);
    expect(statesSetByHand("culled")).toEqual([]);
  });

  it("never offers an exit or Ready for Sale, from anywhere", () => {
    const states = [
      "calf",
      "heifer",
      "pregnant_heifer",
      "milking",
      "dry",
      "quarantine",
      "fattening",
      "ready_for_sale",
    ] as const;
    for (const from of states) {
      expect(statesSetByHand(from)).not.toContain("sold");
      expect(statesSetByHand(from)).not.toContain("died");
      expect(statesSetByHand(from)).not.toContain("culled");
      expect(statesSetByHand(from)).not.toContain("ready_for_sale");
    }
  });
});

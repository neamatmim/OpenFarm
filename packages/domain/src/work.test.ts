import { describe, expect, it } from "vitest";

import { maySignOff } from "./work";

// Marking your own work as checked is not a check — except for the Owner. The sign-off queue asks this before it
// offers Approve and Send back, and the farm refuses by it, so the two cannot disagree.

const done = (claimedBy: string | null, assignedTo: string | null = null) => ({
  claimedBy,
  assignedTo,
});

describe("who may sign work off", () => {
  it("is anybody but the person who did it", () => {
    expect(maySignOff(done("rahim"), { id: "karim", roles: ["manager"] })).toBe(
      true
    );
    expect(maySignOff(done("rahim"), { id: "rahim", roles: ["manager"] })).toBe(
      false
    );
  });

  it("counts work nobody claimed as the doing of the person it was pinned to", () => {
    expect(
      maySignOff(done(null, "rahim"), { id: "rahim", roles: ["staff"] })
    ).toBe(false);
  });

  it("lets the Owner sign off what they did themselves", () => {
    expect(
      maySignOff(done("owner-1"), { id: "owner-1", roles: ["owner"] })
    ).toBe(true);
  });

  it("lets anybody sign off work nobody claimed or was given", () => {
    expect(maySignOff(done(null), { id: "rahim", roles: ["staff"] })).toBe(
      true
    );
  });
});

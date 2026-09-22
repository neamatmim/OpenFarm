import { describe, expect, it } from "vitest";

import { reachesTheirAccess } from "./their-access";

// The server refuses a Manager who reaches into anybody's way in but Barn Staff's. A screen that offered the button
// anyway would only ever show a refusal, so it asks the same question first.

describe("who may reach into somebody's way in", () => {
  it("is the Owner, for anybody", () => {
    expect(reachesTheirAccess(true, ["owner"])).toBe(true);
    expect(reachesTheirAccess(true, ["manager", "vet"])).toBe(true);
  });

  it("is a Manager for Barn Staff alone, and for nobody who holds more", () => {
    expect(reachesTheirAccess(false, ["staff"])).toBe(true);
    expect(reachesTheirAccess(false, ["owner"])).toBe(false);
    expect(reachesTheirAccess(false, ["vet"])).toBe(false);
    expect(reachesTheirAccess(false, ["staff", "manager"])).toBe(false);
  });
});

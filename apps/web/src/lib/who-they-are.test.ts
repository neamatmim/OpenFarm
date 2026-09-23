import { describe, expect, it } from "vitest";

import { whoTheyAre } from "./who-they-are";

const OWNER = { id: "u1", farm: { id: "f1" }, roles: ["owner"] };
const NO_LONGER = { id: "u1", farm: { id: "f1" }, roles: [] };

describe("who the farm says this person is", () => {
  it("takes the farm's answer over the one the phone remembers", async () => {
    // Roles taken away: what the phone remembers would let them onto screens the farm now refuses.
    const said = await whoTheyAre({
      known: OWNER,
      ask: () => Promise.resolve(NO_LONGER),
    });
    expect(said).toEqual(NO_LONGER);
  });

  // A milker mid-shift with a morning's work in the Outbox: the farm being out of reach is not a change of who
  // they are, and sending them back to a login would be the worst answer available.
  it("stands by what the phone remembers when the farm cannot be reached", async () => {
    const said = await whoTheyAre({
      known: OWNER,
      ask: () => Promise.reject(new Error("no signal")),
    });
    expect(said).toEqual(OWNER);
  });

  it("has nothing to go on when the farm cannot be reached and the phone remembers nobody", async () => {
    const said = await whoTheyAre({
      known: undefined,
      ask: () => Promise.reject(new Error("no signal")),
    });
    expect(said).toBeUndefined();
  });
});

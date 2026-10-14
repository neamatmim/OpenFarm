import { describe, expect, it } from "vitest";

import type { SeenTo } from "./seen-to";
import { seenToSaid } from "./seen-to";

const at = new Date("2065-02-09T21:00:00.000Z");

describe("what the list says about a cow giving less", () => {
  it("says the Vet has seen her, before saying anybody asked", () => {
    expect(seenToSaid({ by: "vet", at })).toEqual({
      key: "givingLess.seenByVet",
      at,
    });
    expect(seenToSaid({ by: "asked", at })).toEqual({
      key: "givingLess.vetAsked",
      at,
    });
  });

  it("says nothing has been done when nobody has, or an answer kept from before says nothing", () => {
    expect(seenToSaid(null)).toBeNull();
    const keptFromBefore: { seenTo?: SeenTo } = {};
    expect(seenToSaid(keptFromBefore.seenTo)).toBeNull();
  });
});

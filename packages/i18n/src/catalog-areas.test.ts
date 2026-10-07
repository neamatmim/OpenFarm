import { describe, expect, it } from "vitest";

import { DESK_AREAS } from "./catalog-areas";
import { bnCore } from "./messages/bn-core";
import { bnDesk } from "./messages/bn-desk";
import { enCore } from "./messages/en-core";
import { enDesk } from "./messages/en-desk";

// The words a Shed Phone fetches first, and those it fetches once its screen is drawn. A desk word in the first half
// makes every shed screen download it; a shed word in the second shows its key on a Shed Phone until the rest arrive.

const areaOf = (key: string) => key.slice(0, key.indexOf("."));

describe("the farm's words, in two halves", () => {
  it("keep each desk area's words in the desk half, and none of them in the shed's", () => {
    expect(
      Object.keys(enCore).filter((key) => DESK_AREAS.has(areaOf(key)))
    ).toEqual([]);
    expect(
      Object.keys(enDesk).filter((key) => !DESK_AREAS.has(areaOf(key)))
    ).toEqual([]);
  });

  it("say each half in Bangla with the same keys as in English", () => {
    expect(Object.keys(bnCore).toSorted()).toEqual(
      Object.keys(enCore).toSorted()
    );
    expect(Object.keys(bnDesk).toSorted()).toEqual(
      Object.keys(enDesk).toSorted()
    );
  });

  it("are both of a size worth the split", () => {
    // If either half emptied, the split would be saying nothing.
    expect(Object.keys(enDesk).length).toBeGreaterThan(1000);
    expect(Object.keys(enCore).length).toBeGreaterThan(2000);
  });
});

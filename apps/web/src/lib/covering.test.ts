import { describe, expect, it } from "vitest";

import type { PersonForCover } from "./covering";
import { whoMayBeAway, whoMayCover } from "./covering";

const person = (
  id: string,
  roles: string[],
  penIds: string[],
  disabledAt: string | null = null
): PersonForCover => ({ id, name: id, roles, penIds, disabledAt });

const PEOPLE = [
  person("rahim", ["staff"], ["pen-a"]),
  person("jasim", ["staff"], []),
  person("karim", ["staff"], ["pen-b"], "2026-10-01"),
  person("manager", ["manager"], []),
];

describe("who a Cover is offered", () => {
  it("offers as away only Barn Staff still here who keep a Pen", () => {
    expect(whoMayBeAway(PEOPLE).map((one) => one.id)).toEqual(["rahim"]);
  });

  it("offers as cover any other Barn Staff still here, never the one away", () => {
    expect(whoMayCover(PEOPLE, "rahim").map((one) => one.id)).toEqual([
      "jasim",
    ]);
  });
});

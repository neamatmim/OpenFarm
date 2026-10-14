import { describe, expect, it } from "vitest";

import type { PersonForCover } from "./covering";
import { standingToday, whoMayBeAway, whoMayCover } from "./covering";

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

describe("the Covers standing today", () => {
  it("leaves out a Cover from a kept answer of an earlier day, and one ended early", () => {
    const covers = [
      { id: "yesterday", day: "2089-04-09", endedAt: null },
      { id: "ended", day: "2089-04-10", endedAt: "2089-04-10T05:00:00Z" },
      { id: "standing", day: "2089-04-10", endedAt: null },
    ];
    expect(standingToday(covers, "2089-04-10").map((one) => one.id)).toEqual([
      "standing",
    ]);
  });
});

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

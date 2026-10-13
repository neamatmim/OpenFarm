import { describe, expect, it } from "vitest";

import type { NarrowedRow } from "./herd-narrowing";
import { narrowed } from "./herd-narrowing";

const cow = (
  tagNumber: string,
  photoUpdatedAt: NarrowedRow["photoUpdatedAt"]
) =>
  ({
    tagNumber,
    officialTag: null,
    side: "dairy",
    state: "milking",
    penId: "pen-1",
    milkHeld: false,
    meatHeld: false,
    photoUpdatedAt,
  }) satisfies NarrowedRow;

describe("the herd narrowed to who has no photo yet", () => {
  const herd = [
    cow("A-1", new Date("2034-03-01T04:00:00.000Z")),
    cow("A-2", null),
    // A list this phone kept reads her photo's day back as text.
    cow("A-3", "2034-03-01T04:00:00.000Z"),
    cow("A-4", null),
  ];

  it("leaves only the animals still owed a photo", () => {
    expect(
      narrowed(herd, { photo: "none" }, "").map((row) => row.tagNumber)
    ).toEqual(["A-2", "A-4"]);
  });

  it("leaves everybody when no photo is asked for", () => {
    expect(narrowed(herd, {}, "")).toHaveLength(4);
  });

  it("narrows with the other filters, not instead of them", () => {
    expect(
      narrowed(herd, { photo: "none" }, "A-4").map((row) => row.tagNumber)
    ).toEqual(["A-4"]);
  });
});

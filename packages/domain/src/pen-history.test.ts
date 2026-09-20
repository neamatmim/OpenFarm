import { describe, expect, it } from "vitest";

import type { PenSpellOf } from "./pen-history";
import { arrivalOf, exitOf, penHistoryOf, penSpellsOf } from "./pen-history";

// Where she stood, how she came to be here and how she left, worked out from her Moves and her State. No database: these
// are the three facts every reader of her record used to work out for itself, and the gaps were where two disagreed.

const at = (monthAndDay: string) =>
  new Date(`2027-${monthAndDay}T04:00:00.000Z`);

/** Her Moves as the farm wrote them: the one that put her here, then the ones that walked her on. */
const moves = [
  {
    id: "1",
    movedAt: at("01-10"),
    toPen: "কোয়ারেন্টিন",
    fromPenId: null,
    reason: "intake",
  },
  {
    id: "2",
    movedAt: at("02-14"),
    toPen: "মোটাতাজা ১",
    fromPenId: "q",
    reason: null,
  },
  {
    id: "3",
    movedAt: at("03-20"),
    toPen: "মোটাতাজা ২",
    fromPenId: "f1",
    reason: null,
  },
];

describe("her Pen Spells", () => {
  it("runs each spell to the Move that took her away, and the last one to nothing while she is here", () => {
    expect(penSpellsOf(moves, null)).toEqual<PenSpellOf<string>[]>([
      { pen: "কোয়ারেন্টিন", from: at("01-10"), until: at("02-14") },
      { pen: "মোটাতাজা ১", from: at("02-14"), until: at("03-20") },
      { pen: "মোটাতাজা ২", from: at("03-20"), until: null },
    ]);
  });

  it("ends her last spell when she left, however she went", () => {
    const spells = penSpellsOf(moves, at("05-01"));
    expect(spells.at(-1)?.until).toEqual(at("05-01"));
  });

  it("keeps the order two Moves at the same instant were written in", () => {
    const together = [
      { id: "b", movedAt: at("01-10"), toPen: "দ্বিতীয়" },
      { id: "a", movedAt: at("01-10"), toPen: "প্রথম" },
    ];
    expect(penSpellsOf(together, null).map((spell) => spell.pen)).toEqual([
      "প্রথম",
      "দ্বিতীয়",
    ]);
  });

  it("says nothing of an animal who has never been walked anywhere", () => {
    expect(penSpellsOf([], null)).toEqual([]);
  });
});

describe("how she arrived", () => {
  it("reads the Move that put her in her first Pen, whichever way she came", () => {
    expect(arrivalOf(moves)).toEqual({ how: "bought", at: at("01-10") });
    expect(
      arrivalOf([{ movedAt: at("01-10"), fromPenId: null, reason: "born" }])
    ).toEqual({ how: "born", at: at("01-10") });
  });

  it("calls an animal the farm wrote into its opening register already here", () => {
    expect(
      arrivalOf([
        { movedAt: at("01-10"), fromPenId: null, reason: "registered" },
      ])
    ).toEqual({ how: "already_here", at: at("01-10") });
  });

  it("says nothing when no Move brought her onto the farm", () => {
    expect(
      arrivalOf([{ movedAt: at("02-14"), fromPenId: "q", reason: null }])
    ).toBeNull();
  });
});

describe("how she left", () => {
  it("is her State once it is an Exit, and the moment she reached it", () => {
    for (const how of ["sold", "died", "culled"] as const) {
      expect(exitOf({ state: how, stateChangedAt: at("05-01") })).toEqual({
        how,
        at: at("05-01"),
      });
    }
  });

  it("is nothing at all while she is still standing in a Pen", () => {
    expect(
      exitOf({ state: "fattening", stateChangedAt: at("02-14") })
    ).toBeNull();
  });
});

describe("the whole farm's Pen history", () => {
  it("ends each animal's last line when she left, and leaves it open while she is here", () => {
    const herd = [
      {
        id: "1",
        animalId: "her",
        toPenId: "q",
        toSide: "fattening" as const,
        movedAt: at("01-10"),
      },
      {
        id: "2",
        animalId: "her",
        toPenId: "f1",
        toSide: "fattening" as const,
        movedAt: at("02-14"),
      },
      {
        id: "3",
        animalId: "another",
        toPenId: "d1",
        toSide: "dairy" as const,
        movedAt: at("01-10"),
      },
    ];
    expect(penHistoryOf(herd, new Map([["her", at("05-01")]]))).toEqual([
      {
        animalId: "her",
        penId: "q",
        side: "fattening",
        from: at("01-10"),
        until: at("02-14"),
      },
      {
        animalId: "her",
        penId: "f1",
        side: "fattening",
        from: at("02-14"),
        until: at("05-01"),
      },
      {
        animalId: "another",
        penId: "d1",
        side: "dairy",
        from: at("01-10"),
        until: null,
      },
    ]);
  });
});

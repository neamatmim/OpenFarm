import { describe, expect, it } from "vitest";

import {
  anythingChanged,
  asShown,
  changesFrom,
  choice,
  day,
  figure,
  note,
  person,
} from "./correcting";

// What a Correction actually sends. The farm refuses one that changes nothing, and one made against values somebody
// has changed since (ADR 0005), so these are the decisions that decide whether a person's correction is taken at all.

const aSale = () => ({
  priceBdt: figure(92_000),
  buyer: person("রহমান ব্যাপারী"),
});

describe("what a Correction sends", () => {
  it("sends only the fields somebody actually changed", () => {
    const changes = changesFrom(aSale(), {
      priceBdt: "95000",
      buyer: "রহমান ব্যাপারী",
    });
    expect(changes).toEqual({
      priceBdt: { from: 92_000, to: 95_000 },
    });
  });

  it("says nothing changed when nothing did, so the farm is not asked to take it", () => {
    const typed = { priceBdt: "92000", buyer: "রহমান ব্যাপারী" };
    expect(changesFrom(aSale(), typed)).toEqual({});
    expect(anythingChanged(aSale(), typed)).toBe(false);
  });

  it("starts every box from what the record says now", () => {
    expect(asShown(aSale())).toEqual({
      priceBdt: "92000",
      buyer: "রহমান ব্যাপারী",
    });
  });

  it("says what the record held, not what the box showed, so the farm can tell it is stale", () => {
    const [sent] = Object.values(
      changesFrom({ litres: figure(210) }, { litres: "180" })
    );
    expect(sent?.from).toBe(210);
  });
});

describe("the farm's kinds of field", () => {
  it("hands over a person as the person, and ignores a blank box", () => {
    expect(changesFrom({ buyer: person("করিম") }, { buyer: " সালাম " })).toEqual({
      buyer: { from: "করিম", to: { name: "সালাম" } },
    });
    // Nobody named: not a correction to somebody's name, and not an empty name sent to the farm.
    expect(changesFrom({ buyer: person("করিম") }, { buyer: "  " })).toEqual({});
  });

  it("keeps a note the farm has none of as none, rather than as an empty note", () => {
    expect(asShown({ challan: note(null) })).toEqual({ challan: "" });
    // Cleared: the farm is told the note is now nothing, which is a change it can take.
    expect(changesFrom({ challan: note("৪৪১") }, { challan: " " })).toEqual({
      challan: { from: "৪৪১", to: "" },
    });
    // Untouched: nothing at all is sent about it.
    expect(changesFrom({ challan: note(null) }, { challan: "" })).toEqual({});
  });

  it("reads a figure the farm does not hold as nothing to correct", () => {
    // A feed arrival nobody priced: putting a price on it is not a Correction of the price it had.
    expect(
      changesFrom({ priceBdt: figure(null) }, { priceBdt: "700" })
    ).toEqual({});
  });

  it("says a day the way the farm writes one down", () => {
    const born = day(new Date("2027-03-04T02:00:00.000Z"));
    expect(born.shows).toBe("2027-03-04");
    expect(changesFrom({ bornOn: born }, { bornOn: "2027-03-05" })).toEqual({
      bornOn: { from: "2027-03-04", to: "2027-03-05" },
    });
  });

  it("takes one of the farm's own words, and nothing for none chosen", () => {
    const how = choice<"died" | "culled">("died");
    expect(changesFrom({ kind: how }, { kind: "culled" })).toEqual({
      kind: { from: "died", to: "culled" },
    });
    expect(changesFrom({ kind: how }, { kind: "" })).toEqual({});
  });
});

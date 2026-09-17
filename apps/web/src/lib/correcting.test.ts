import { describe, expect, it } from "vitest";

import {
  amount,
  bilingual,
  asShown,
  changesFrom,
  choice,
  readyToSend,
  day,
  figure,
  counterparty,
  note,
  words,
} from "./correcting";

// What a Correction actually sends. The farm refuses one that changes nothing, and one made against values somebody
// has changed since (ADR 0005), so these are the decisions that decide whether a person's correction is taken at all.

const aSale = () => ({
  priceBdt: figure(92_000),
  buyer: counterparty("রহমান ব্যাপারী"),
});

describe("what a Correction sends", () => {
  it("sends only the answers somebody actually changed", () => {
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
    expect(readyToSend(aSale(), typed)).toBe(false);
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

describe("what the farm could take at all", () => {
  it("will not send a price of nothing, which the farm would store as nothing", () => {
    const sale = { priceBdt: amount(92_000), buyer: counterparty("করিম") };
    // Changed, and not something the farm should be asked to take.
    expect(changesFrom(sale, { priceBdt: "0", buyer: "করিম" })).toEqual({
      priceBdt: { from: 92_000, to: 0 },
    });
    expect(readyToSend(sale, { priceBdt: "0", buyer: "করিম" })).toBe(false);
    expect(readyToSend(sale, { priceBdt: "95000", buyer: "করিম" })).toBe(true);
  });

  it("will not send a box somebody emptied where the farm holds a figure", () => {
    const fed = { quantity: amount(40) };
    expect(readyToSend(fed, { quantity: "" })).toBe(false);
    expect(readyToSend(fed, { quantity: "abc" })).toBe(false);
  });

  it("will not rub out a buyer the record names", () => {
    const sale = { buyer: counterparty("করিম") };
    expect(readyToSend(sale, { buyer: " " })).toBe(false);
  });
});

describe("the farm's kinds of field", () => {
  it("hands over a person as the person, and ignores a blank box", () => {
    expect(
      changesFrom({ buyer: counterparty("করিম") }, { buyer: " সালাম " })
    ).toEqual({
      buyer: { from: "করিম", to: { name: "সালাম" } },
    });
    // Nobody named: not a correction to somebody's name, and not an empty name sent to the farm.
    expect(
      changesFrom({ buyer: counterparty("করিম") }, { buyer: "  " })
    ).toEqual({});
  });

  it("clears a note to nothing, rather than to an empty note", () => {
    expect(asShown({ challan: note(null) })).toEqual({ challan: "" });
    // Cleared: the farm reads a challan set to nothing as one it no longer holds.
    expect(changesFrom({ challan: note("৪৪১") }, { challan: " " })).toEqual({
      challan: { from: "৪৪১", to: null },
    });
    // Untouched: nothing at all is sent about it.
    expect(changesFrom({ challan: note(null) }, { challan: "" })).toEqual({});
  });

  it("will not clear words the farm always holds, like the cause of a death", () => {
    expect(changesFrom({ cause: words("তড়কা") }, { cause: "  " })).toEqual({});
    expect(changesFrom({ cause: words("তড়কা") }, { cause: "বজ্রপাত" })).toEqual({
      cause: { from: "তড়কা", to: "বজ্রপাত" },
    });
  });

  it("reads a figure the farm does not hold as nothing to correct", () => {
    // A feed arrival nobody priced: putting a price on it is not a Correction of the price it had.
    expect(
      changesFrom({ priceBdt: figure(null) }, { priceBdt: "700" })
    ).toEqual({});
  });

  it("hands a Disease over as the farm keeps it, in Bangla", () => {
    expect(
      changesFrom({ disease: bilingual("তড়কা") }, { disease: " ওলান প্রদাহ " })
    ).toEqual({ disease: { from: "তড়কা", to: { bn: "ওলান প্রদাহ" } } });
    // A Disease rubbed out is not a conclusion the farm can take.
    expect(readyToSend({ disease: bilingual("তড়কা") }, { disease: "" })).toBe(
      false
    );
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

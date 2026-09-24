import { describe, expect, it } from "vitest";

import { fieldChanges } from "./audit-words";

// The table of what a change touched is read by the Owner, and in Bangla it said "5" and
// "2026-09-24T11:00:00.000Z" as the database keeps them. The whole record, below it, still does.

const afterOf = (after: Record<string, unknown>, language: "bn" | "en") =>
  fieldChanges(null, after, language).map((change) => change.after);

describe("the fields a change touched", () => {
  it("says a count in the reader's numerals", () => {
    expect(afterOf({ slots: 5 }, "bn")).toEqual(["৫"]);
    expect(afterOf({ slots: 5 }, "en")).toEqual(["5"]);
  });

  it("says a figure the database keeps as text in the reader's numerals", () => {
    expect(afterOf({ litres: "12.50" }, "bn")).toEqual(["১২.৫"]);
  });

  it("says an instant as a date and a time, and a day as a date", () => {
    const [at, on] = afterOf(
      { claimedAt: "2026-09-24T11:00:00.000Z", receivedOn: "2026-09-24" },
      "bn"
    );
    expect(at).toContain("২৪");
    expect(at).toContain("১৭:০০");
    expect(on).toContain("২৪");
    expect(`${at}${on}`).not.toMatch(/[0-9]/u);
  });

  it("leaves a phone, an NID and a tag as they were written", () => {
    expect(
      afterOf(
        { phone: "01712345678", nid: "1985220788", tagNumber: "D-0012" },
        "bn"
      )
    ).toEqual(["01712345678", "1985220788", "D-0012"]);
  });
});

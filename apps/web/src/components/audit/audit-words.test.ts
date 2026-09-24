import { describe, expect, it } from "vitest";

import { fieldChanges, whyRaised } from "./audit-words";

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

/** The day's turn as the trail keeps it, saying what it says. */
const theDay = (after: Record<string, unknown>) => ({
  entity: "sop_instance",
  entityId: "schedule:2026-09-24",
  action: "create" as const,
  after,
});

describe("why the farm raised work", () => {
  it("says how much the day's turn raised, and by what", () => {
    expect(
      whyRaised(
        theDay({
          raised: 3,
          byTheSchedule: 2,
          byWhatHappened: 1,
          forTheRenewal: 0,
        })
      )
    ).toEqual([
      { key: "audit.raised.onSchedule", params: { count: 2 } },
      { key: "audit.raised.byWhatHappened", params: { count: 1 } },
    ]);
  });

  it("says only that the farm looked, for a turn written before the trail said how much", () => {
    expect(whyRaised(theDay({ slots: 2 }))).toEqual([
      { key: "audit.raised.checked" },
    ]);
  });

  it("says work raised by hand was, and nothing of any other event", () => {
    expect(
      whyRaised({
        entity: "sop_instance",
        entityId: "sop-1:2026-09-24T05:00:00.000Z",
        action: "create",
        after: { definitionId: "sop-1", penId: "pen-1" },
      })
    ).toEqual([{ key: "audit.raised.byHand" }]);
    expect(
      whyRaised({
        entity: "user",
        entityId: "u-1",
        action: "update",
        after: { language: "en" },
      })
    ).toEqual([]);
  });
});

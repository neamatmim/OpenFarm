import { describe, expect, it } from "vitest";

import {
  EID_UL_ADHA,
  QURBANI_DAYS,
  eidByTheCalendar,
  eidsListed,
  expectedEidNear,
  isSameEid,
  nextEidWindow,
} from "./eid";
import { addDays } from "./fattening";

// The Eid a fattening animal is fed towards: the table's expected day, the day the farm wrote in once the moon
// sighting committee announced it, and past the table the calendar's guess — each window saying which it is.

describe("the Eid the farm is feeding towards", () => {
  it("names the next one and the three days of selling it opens", () => {
    // Qurbani runs the tenth, eleventh and twelfth of Dhul Hijjah.
    expect(nextEidWindow("2027-01-01")).toEqual({
      start: "2027-05-17",
      end: "2027-05-19",
      basis: "expected",
    });
  });

  it("is still the one the farm is standing in on its last day", () => {
    // An animal bought on the second day of Qurbani is not fed for a market closing tomorrow, but the
    // farm is still in that market.
    expect(nextEidWindow("2027-05-17")?.start).toBe("2027-05-17");
    expect(nextEidWindow("2027-05-19")?.start).toBe("2027-05-17");
  });

  it("moves to next year's only once the last day is past", () => {
    expect(nextEidWindow("2027-05-20")?.start).toBe("2028-05-06");
  });

  it("keeps the table in order, since the search takes the first that has not passed", () => {
    expect([...EID_UL_ADHA]).toEqual([...EID_UL_ADHA].toSorted());
  });
});

describe("an Eid the committee has announced", () => {
  it("stands in for the day the table expected", () => {
    expect(nextEidWindow("2027-01-01", ["2027-05-18"])).toEqual({
      start: "2027-05-18",
      end: "2027-05-20",
      basis: "announced",
    });
  });

  it("is still the farm's Eid on its own last day, a day after the expected one's", () => {
    expect(nextEidWindow("2027-05-20", ["2027-05-18"])?.start).toBe(
      "2027-05-18"
    );
    expect(nextEidWindow("2027-05-21", ["2027-05-18"])).toMatchObject({
      start: "2028-05-06",
      basis: "expected",
    });
  });

  it("leaves the other years as the table has them", () => {
    expect(nextEidWindow("2027-06-01", ["2027-05-18"])?.start).toBe(
      "2028-05-06"
    );
  });
});

describe("an Eid past the end of the table", () => {
  const pastTheTable = addDays(EID_UL_ADHA.at(-1) as string, QURBANI_DAYS);

  it("is the calendar's guess, and says so", () => {
    expect(nextEidWindow(pastTheTable)).toEqual({
      start: "2037-01-28",
      end: "2037-01-30",
      basis: "estimated",
    });
    expect(nextEidWindow("2039-06-01")?.start).toBe("2039-12-27");
  });

  it("gives way to a day the farm announced", () => {
    expect(nextEidWindow(pastTheTable, ["2037-01-27"])).toMatchObject({
      start: "2037-01-27",
      basis: "announced",
    });
  });

  it("agrees with the table to within a day across all of it", () => {
    for (const day of EID_UL_ADHA) {
      const guess = eidByTheCalendar(addDays(day, -10));
      expect(guess && isSameEid(guess, day)).toBe(true);
    }
  });
});

describe("the day an announced Eid was expected on", () => {
  it("is the table's, a day either side", () => {
    expect(expectedEidNear("2027-05-18")).toBe("2027-05-17");
    expect(expectedEidNear("2027-05-16")).toBe("2027-05-17");
  });

  it("is the calendar's past the table", () => {
    expect(expectedEidNear("2037-01-27")).toBe("2037-01-28");
  });

  it("is nothing for a day that is no Eid, a year typed wrong", () => {
    expect(expectedEidNear("2027-06-17")).toBe(null);
    expect(expectedEidNear("2026-05-17")).toBe(null);
  });
});

describe("the Eids the farm keeps a list of", () => {
  it("is the last one sold into, every one the table expects, and two the calendar guesses past it", () => {
    const listed = eidsListed("2027-01-01");

    expect(listed[0]).toEqual({ expectedDay: "2026-05-28", basis: "expected" });
    expect(listed.filter((one) => one.basis === "expected")).toHaveLength(
      EID_UL_ADHA.length
    );
    const guessed = listed.filter((one) => one.basis === "estimated");
    expect(guessed).toHaveLength(2);
    expect(
      guessed[0]?.expectedDay.localeCompare(EID_UL_ADHA.at(-1) ?? "")
    ).toBe(1);
    // Every Eid once, a Hijri year apart.
    const days = listed.map((one) => one.expectedDay);
    expect(days).toEqual(days.toSorted());
    expect(new Set(days).size).toBe(days.length);
  });

  it("keeps the one the farm is standing in while Qurbani is on", () => {
    expect(eidsListed("2027-05-18")[1]?.expectedDay).toBe("2027-05-17");
    expect(eidsListed("2027-05-18")[0]?.expectedDay).toBe("2026-05-28");
  });

  it("still names the Eids ahead once the table has run out", () => {
    const listed = eidsListed("2040-01-01");

    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((one) => one.expectedDay >= "2039-01-01")).toBe(true);
  });
});

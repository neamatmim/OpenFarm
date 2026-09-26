import { describe, expect, it } from "vitest";

import type { Nominee } from "./nominees";
import { isMinorOn, nomineesProblem } from "./nominees";

const DAY = "2026-09-26";

const adult = (share: number, name = "রহিমা বেগম"): Nominee => ({
  name,
  relation: "স্ত্রী",
  phone: "01712-345678",
  bornOn: "1982-03-14",
  sharePercent: share,
  receiver: null,
});

const minor = (share: number, receiver: Nominee["receiver"]): Nominee => ({
  name: "সাদিয়া আক্তার",
  relation: "মেয়ে",
  phone: null,
  bornOn: "2012-11-20",
  sharePercent: share,
  receiver,
});

const MOTHER = { name: "রহিমা বেগম", relation: "মা", phone: null };

describe("coming of age", () => {
  it("is a minor the day before the eighteenth birthday and not on it", () => {
    expect(isMinorOn("2008-09-27", DAY)).toBe(true);
    expect(isMinorOn("2008-09-26", DAY)).toBe(false);
  });

  it("comes of age on the first of March for one born on the 29th of February, in a year without one", () => {
    expect(isMinorOn("2008-02-29", "2026-02-28")).toBe(true);
    expect(isMinorOn("2008-02-29", "2026-03-01")).toBe(false);
  });
});

describe("what stops a paper naming its Nominees", () => {
  it("lets an Investor name none", () => {
    expect(nomineesProblem([], DAY)).toBeNull();
  });

  it("lets one collect the whole, and three collect shares adding to a hundred", () => {
    expect(nomineesProblem([adult(100)], DAY)).toBeNull();
    expect(
      nomineesProblem([adult(50), adult(30, "তানভীর"), minor(20, MOTHER)], DAY)
    ).toBeNull();
  });

  it("refuses a fourth", () => {
    expect(
      nomineesProblem(
        [adult(25), adult(25, "খ"), adult(25, "গ"), adult(25, "ঘ")],
        DAY
      )
    ).toEqual({ code: "too_many" });
  });

  it("refuses shares that do not add to a hundred", () => {
    expect(nomineesProblem([adult(50), adult(40, "খ")], DAY)).toEqual({
      code: "shares_not_hundred",
    });
  });

  it("refuses a share that is not a whole percent, or none at all", () => {
    expect(nomineesProblem([adult(50.5), adult(49.5, "খ")], DAY)).toEqual({
      code: "shares_not_whole",
      at: 1,
    });
    expect(nomineesProblem([adult(100), adult(0, "খ")], DAY)).toEqual({
      code: "shares_not_whole",
      at: 2,
    });
  });

  it("refuses a Nominee with no name, no date of birth, or one not born yet", () => {
    expect(nomineesProblem([adult(100, " ")], DAY)).toEqual({
      code: "name_missing",
      at: 1,
    });
    expect(nomineesProblem([{ ...adult(100), bornOn: null }], DAY)).toEqual({
      code: "born_missing",
      at: 1,
    });
    expect(
      nomineesProblem([{ ...adult(100), bornOn: "2026-09-27" }], DAY)
    ).toEqual({ code: "born_in_future", at: 1 });
  });

  it("asks a Receiver for a minor, and refuses one for an adult", () => {
    expect(nomineesProblem([adult(80), minor(20, null)], DAY)).toEqual({
      code: "receiver_missing",
      at: 2,
    });
    expect(nomineesProblem([{ ...adult(100), receiver: MOTHER }], DAY)).toEqual(
      { code: "receiver_not_needed", at: 1 }
    );
  });

  it("judges a minor on the day the paper is signed", () => {
    const turnsEighteen = { ...minor(100, MOTHER), bornOn: "2008-09-26" };
    expect(nomineesProblem([turnsEighteen], DAY)).toEqual({
      code: "receiver_not_needed",
      at: 1,
    });
    expect(nomineesProblem([turnsEighteen], "2026-09-25")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  investorLoginOf,
  isInvestorLogin,
  mobileNumberOf,
  phoneOfInvestorLogin,
} from "./investor-login";

describe("an Investor's phone as they type it", () => {
  it("is one number however it was written", () => {
    for (const typed of [
      "01711000000",
      "+8801711000000",
      "8801711000000",
      "017-1100 0000",
      "০১৭১১০০০০০০",
    ]) {
      expect(mobileNumberOf(typed)).toBe("01711000000");
    }
  });

  it("is not a number when it is not a Bangladeshi mobile", () => {
    expect(mobileNumberOf("0171100000")).toBeNull();
    expect(mobileNumberOf("02-9123456")).toBeNull();
    expect(mobileNumberOf("")).toBeNull();
  });
});

describe("the address a portal account signs in as", () => {
  it("is made from the phone, the same however it was typed", () => {
    expect(investorLoginOf("+880 1711-000000")).toBe(
      "01711000000@investor.openfarm.invalid"
    );
    expect(investorLoginOf("০১৭১১০০০০০০")).toBe(investorLoginOf("01711000000"));
  });

  it("is told apart from anybody's who works on the farm", () => {
    expect(isInvestorLogin("01711000000@INVESTOR.openfarm.invalid")).toBe(true);
    expect(isInvestorLogin("owner@openfarm.test")).toBe(false);
  });

  it("gives back the phone it was made from, and nothing for anybody else's", () => {
    expect(
      phoneOfInvestorLogin(investorLoginOf("+880 1711-000000") ?? "")
    ).toBe("01711000000");
    expect(phoneOfInvestorLogin("owner@openfarm.test")).toBeNull();
  });
});

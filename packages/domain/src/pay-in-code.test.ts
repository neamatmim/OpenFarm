import { describe, expect, it } from "vitest";

import { payInCode, payInCodeIn } from "./pay-in-code";

describe("a Pay-in Code", () => {
  it("is the Venture's place on the farm and the Agreement's on the Venture", () => {
    expect(payInCode(3, 7)).toBe("PAY-3-07");
    expect(payInCode(12, 20)).toBe("PAY-12-20");
    expect(payInCode(1, 105)).toBe("PAY-1-105");
  });

  it("has no letter that reads as a digit on a deposit slip", () => {
    // O is 0, I and L are 1, S is 5, B is 8, Z is 2, G is 6.
    expect(payInCode(3, 7)).not.toMatch(/[OILSBZG]/u);
  });
});

describe("a Pay-in Code in a bank's reference", () => {
  const codes = ["PAY-3-01", "PAY-3-07", "PAY-3-12"];

  it("is found however the bank spelled the dashes", () => {
    expect(payInCodeIn("PAY-3-07", codes)).toBe("PAY-3-07");
    expect(payInCodeIn("BEFTN/2046/PAY 3 07/KARIM", codes)).toBe("PAY-3-07");
    expect(payInCodeIn("pay/3/7", codes)).toBe("PAY-3-07");
    expect(payInCodeIn("NPSB PAY307 0987", codes)).toBe("PAY-3-07");
    expect(payInCodeIn("PAY-৩-০৭", codes)).toBe("PAY-3-07");
  });

  it("is not found in a reference that carries none of them", () => {
    expect(payInCodeIn("TRF-88213", codes)).toBeUndefined();
    expect(payInCodeIn("PAY-3-08", codes)).toBeUndefined();
    expect(payInCodeIn("PAYMENT 3 07", codes)).toBeUndefined();
    expect(payInCodeIn("", codes)).toBeUndefined();
  });

  it("does not take one Venture's code for another's", () => {
    expect(payInCodeIn("PAY-31-07", codes)).toBeUndefined();
    expect(payInCodeIn("PAY-3-071", codes)).toBeUndefined();
    expect(payInCodeIn("PAY3071", codes)).toBeUndefined();
  });

  it("picks nothing when the reference carries two, rather than guess", () => {
    expect(payInCodeIn("PAY-3-01 PAY-3-12", codes)).toBeUndefined();
    expect(payInCodeIn("PAY-3-07 again PAY 3 7", codes)).toBe("PAY-3-07");
  });
});

import { describe, expect, it } from "vitest";

import { NO_BAKI } from "./baki";
import { saleStillMissing } from "./sale-missing";

// A Save that stands grey says nothing; one that says what is missing sends the person to the box. These are the
// things a Sale is sent back for, said before it is sent rather than after.

const aSale = {
  tagNumber: "F-0054",
  buyerName: "রহমান ব্যাপারী",
  priceBdt: "150000",
  weightKg: "280",
  destination: "গাবতলী",
  vehicle: "ঢাকা মেট্রো ট ১১-২২৩৩",
  driver: "জামাল",
  paymentMethod: "cash" as const,
  account: { farmAccountId: "", reference: "" },
  baki: NO_BAKI,
};

const NO_ACCOUNTS = new Set<"bkash" | "bank">();
const A_BKASH_NUMBER = new Set<"bkash" | "bank">(["bkash"]);

describe("what a Sale still needs", () => {
  it("needs nothing more once everything is given", () => {
    expect(saleStillMissing(aSale, NO_ACCOUNTS)).toBeNull();
  });

  it("says the day the buyer promised to pay the rest by, and goes to it", () => {
    const owed = {
      ...aSale,
      baki: { owed: true, paidNow: "100000", promisedBy: "" },
    };
    expect(saleStillMissing(owed, NO_ACCOUNTS)).toEqual({
      said: "refusal.bakiNeedsAPromise",
      at: "sale-baki-promised-by",
    });
  });

  it("says what he paid now is more than the price", () => {
    const owed = {
      ...aSale,
      baki: { owed: true, paidNow: "160000", promisedBy: "2027-04-30" },
    };
    expect(saleStillMissing(owed, NO_ACCOUNTS)?.said).toBe(
      "refusal.paidMoreThanPrice"
    );
  });

  it("asks which of the farm's bKash numbers, then the transaction ID", () => {
    const byBkash = { ...aSale, paymentMethod: "bkash" as const };
    expect(saleStillMissing(byBkash, A_BKASH_NUMBER)).toEqual({
      said: "refusal.namesNoFarmAccount",
      at: "sale-paid-by-account",
    });
    const named = {
      ...byBkash,
      account: { farmAccountId: "office", reference: " " },
    };
    expect(saleStillMissing(named, A_BKASH_NUMBER)).toEqual({
      said: "refusal.needsItsReference",
      at: "sale-paid-by-reference",
    });
    expect(
      saleStillMissing(
        { ...named, account: { farmAccountId: "office", reference: "TRX1" } },
        A_BKASH_NUMBER
      )
    ).toBeNull();
  });

  it("asks for no account the farm has not listed, nor for money nobody paid at the gate", () => {
    const byBank = { ...aSale, paymentMethod: "bank" as const };
    expect(saleStillMissing(byBank, A_BKASH_NUMBER)).toBeNull();
    const nothingPaid = {
      ...aSale,
      paymentMethod: "bkash" as const,
      baki: { owed: true, paidNow: "0", promisedBy: "2027-04-30" },
    };
    expect(saleStillMissing(nothingPaid, A_BKASH_NUMBER)).toBeNull();
  });

  it("goes to the first box left empty, in the sheet's order", () => {
    expect(saleStillMissing({ ...aSale, tagNumber: "" }, NO_ACCOUNTS)?.at).toBe(
      "sale-animal"
    );
    expect(
      saleStillMissing({ ...aSale, weightKg: "", driver: "" }, NO_ACCOUNTS)?.at
    ).toBe("sale-weight");
    expect(saleStillMissing({ ...aSale, driver: " " }, NO_ACCOUNTS)?.at).toBe(
      "sale-driver"
    );
  });
});

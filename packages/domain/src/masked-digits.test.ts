import { describe, expect, it } from "vitest";

import { maskedDigits } from "./masked-digits";

describe("a number on a screen", () => {
  it("hides every digit but the last four, and keeps the rest as typed", () => {
    expect(maskedDigits("1985 2207 889933")).toBe("•••• •••• ••9933");
    expect(
      maskedDigits("Rafiqul Islam\n0123-4567-8901\nDutch-Bangla Bank, Uttara")
    ).toBe("Rafiqul Islam\n••••-••••-8901\nDutch-Bangla Bank, Uttara");
  });

  it("counts Bangla digits as digits", () => {
    expect(maskedDigits("২৭২৬২৭২৮২৯১১")).toBe("••••••••২৯১১");
  });

  it("leaves a number no longer than what is shown alone", () => {
    expect(maskedDigits("1234")).toBe("1234");
    expect(maskedDigits("")).toBe("");
  });
});

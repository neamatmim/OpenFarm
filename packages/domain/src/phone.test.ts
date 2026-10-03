import { DEFAULT_FARM_LOCALE, setFarmLocale } from "@OpenFarm/i18n";
import { afterEach, describe, expect, it } from "vitest";

import {
  mobileNumberOf,
  phoneExample,
  phoneSaid,
  readsMobileNumbersOf,
} from "./phone";

afterEach(() => {
  setFarmLocale(DEFAULT_FARM_LOCALE);
});

describe("a mobile number as somebody types it", () => {
  it("is one number however it was written, on a farm in Bangladesh", () => {
    for (const typed of [
      "01711000000",
      "+8801711000000",
      "8801711000000",
      "017-1100 0000",
      "+880 1711-000000",
      "০১৭১১০০০০০০",
    ]) {
      expect(mobileNumberOf(typed)).toBe("+8801711000000");
    }
  });

  it("is not a number when it is not a mobile one", () => {
    expect(mobileNumberOf("0171100000")).toBeNull();
    expect(mobileNumberOf("02-9123456")).toBeNull();
    expect(mobileNumberOf("01211000000")).toBeNull();
    expect(mobileNumberOf("")).toBeNull();
  });

  it("is read in its own country when it is written with its country code", () => {
    expect(mobileNumberOf("+971 50 123 4567")).toBe("+971501234567");
  });

  it("is read in the farm's own country when it has none", () => {
    setFarmLocale({ ...DEFAULT_FARM_LOCALE, country: "KE" });
    expect(mobileNumberOf("0712 345678")).toBe("+254712345678");
    expect(mobileNumberOf("01711000000")).toBeNull();
  });
});

describe("a mobile number as a person reads it", () => {
  it("is written the way the farm's country writes it, in the reader's digits", () => {
    expect(phoneSaid("+8801711000000", "en")).toBe("01711-000000");
    expect(phoneSaid("01711000000", "bn")).toBe("০১৭১১-০০০০০০");
  });

  it("keeps its country code when it is another country's", () => {
    expect(phoneSaid("+971501234567", "en")).toBe("+971 50 123 4567");
  });

  it("is left as it was typed when it is not a mobile number", () => {
    expect(phoneSaid("02-9123456", "en")).toBe("02-9123456");
  });

  it("is shown by example in the shape the farm's country asks for", () => {
    expect(phoneExample("en")).toMatch(/^01\d{3}-\d{6}$/u);
    setFarmLocale({ ...DEFAULT_FARM_LOCALE, country: "KE" });
    expect(phoneExample("en")).toMatch(/^07\d{2} \d{6}$/u);
  });
});

describe("the countries a farm may be in", () => {
  it("are those whose mobile numbers can be read", () => {
    expect(readsMobileNumbersOf("BD")).toBe(true);
    expect(readsMobileNumbersOf("XQ")).toBe(false);
  });
});

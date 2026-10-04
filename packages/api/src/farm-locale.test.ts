import { afterEach, describe, expect, it, vi } from "vitest";

// The server's settings are read as its environment is first loaded, so each case loads them afresh.
const settled = async (setting: Record<string, string | undefined>) => {
  vi.resetModules();
  for (const [name, value] of Object.entries(setting)) {
    vi.stubEnv(name, value);
  }
  const { settleFarmLocale } = await import("./farm-locale");
  const { farmLocale } = await import("@OpenFarm/i18n");
  settleFarmLocale();
  return farmLocale();
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("where the server says the farm is", () => {
  it("is a farm in Bangladesh when it says nothing", async () => {
    expect(
      await settled({
        OPENFARM_CURRENCY: undefined,
        OPENFARM_TIME_ZONE: undefined,
        OPENFARM_COUNTRY: undefined,
        OPENFARM_YEAR_STARTS: undefined,
      })
    ).toEqual({
      currency: "BDT",
      timeZone: "Asia/Dhaka",
      country: "BD",
      yearStarts: 7,
    });
  });

  it("counts in the currency and keeps the clock it was set up with", async () => {
    expect(
      await settled({
        OPENFARM_CURRENCY: "USD",
        OPENFARM_TIME_ZONE: "America/Chicago",
        OPENFARM_COUNTRY: "us",
        OPENFARM_YEAR_STARTS: "01",
      })
    ).toEqual({
      currency: "USD",
      timeZone: "America/Chicago",
      country: "US",
      yearStarts: 1,
    });
  });

  it("stops at a year that begins in no month", async () => {
    await expect(settled({ OPENFARM_YEAR_STARTS: "13" })).rejects.toThrow(
      "OPENFARM_YEAR_STARTS is 13"
    );
    await expect(settled({ OPENFARM_YEAR_STARTS: "July" })).rejects.toThrow(
      "OPENFARM_YEAR_STARTS is July"
    );
  });

  it("stops at a currency the farm has no words for", async () => {
    await expect(settled({ OPENFARM_CURRENCY: "XYZ" })).rejects.toThrow(
      "OPENFARM_CURRENCY is XYZ"
    );
  });

  it("stops at a country whose mobile numbers it cannot read", async () => {
    await expect(settled({ OPENFARM_COUNTRY: "XQ" })).rejects.toThrow(
      "OPENFARM_COUNTRY is XQ"
    );
  });

  it("stops at a time zone nobody knows", async () => {
    await expect(
      settled({ OPENFARM_TIME_ZONE: "Asia/Nowhere" })
    ).rejects.toThrow("Asia/Nowhere");
  });
});

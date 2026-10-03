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
      })
    ).toEqual({ currency: "BDT", timeZone: "Asia/Dhaka", country: "BD" });
  });

  it("counts in the currency and keeps the clock it was set up with", async () => {
    expect(
      await settled({
        OPENFARM_CURRENCY: "USD",
        OPENFARM_TIME_ZONE: "America/Chicago",
        OPENFARM_COUNTRY: "us",
      })
    ).toEqual({ currency: "USD", timeZone: "America/Chicago", country: "US" });
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

import { describe, expect, it } from "vitest";

import type { GrowthHolding } from "./fattening-growth";
import { growthOf } from "./fattening-growth";

const day = (on: string) => new Date(`${on}T06:00:00.000Z`);

/** Came at 200 kg on 1 March, sold at 290 kg on 30 May: 90 kg in 90 days, ৳18,000 of keep. */
const sold: GrowthHolding = {
  takenOn: day("2027-03-01"),
  until: day("2027-05-30"),
  cameKg: 200,
  soldKg: 290,
  readings: [{ kg: 240, at: day("2027-04-01") }],
  chargedMoney: 18_000,
};

/** Came at 250 kg on 1 April, still standing, last weighed 280 kg on 1 May: 30 kg in 30 days, ৳9,000. */
const standing: GrowthHolding = {
  takenOn: day("2027-04-01"),
  until: day("2027-05-30"),
  cameKg: 250,
  soldKg: null,
  readings: [
    { kg: 280, at: day("2027-05-01") },
    { kg: 260, at: day("2027-04-15") },
  ],
  chargedMoney: 9000,
};

describe("how a group of fattening animals grew", () => {
  it("pools their kilos over their days and their keep over their kilos", () => {
    // 120 kg over 120 days; ৳27,000 over 120 kg. Fed 90 and 59 days.
    expect(growthOf([sold, standing])).toEqual({
      gainKgPerDay: 1,
      weighed: 2,
      daysOnFeed: 75,
      costOfGainMoney: 225,
    });
  });

  it("leaves out of the gain one never weighed since she came, but counts her days on feed", () => {
    const unweighed = { ...standing, readings: [] };
    expect(growthOf([sold, unweighed])).toMatchObject({
      gainKgPerDay: 1,
      weighed: 1,
      daysOnFeed: 75,
      costOfGainMoney: 200,
    });
  });

  it("says nothing of a group nobody weighed", () => {
    expect(growthOf([{ ...standing, readings: [] }])).toMatchObject({
      gainKgPerDay: null,
      weighed: 0,
      costOfGainMoney: null,
    });
  });
});

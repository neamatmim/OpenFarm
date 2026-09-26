import { describe, expect, it } from "vitest";

import {
  cullReasonsOf,
  fewestDaysBeforeMilkIsWeighed,
  litresOver,
  milkAgainstKeep,
  milkPriceOf,
} from "./cull";
import type { Kept, MilkAgainstKeep } from "./index";

// ৳8,400 of keep over four weeks: ৳300 a day.
const kept: Kept = { bdt: 8400, days: 28, fed: true, whole: true };
const price = { bdtPerLitre: 55 };

describe("what a litre of the farm's milk fetched", () => {
  it("is everything the Dispatches fetched over every litre they took, not the mean of their prices", () => {
    // 1,000 litres at ৳50 and 500 at ৳56: ৳78,000 over 1,500 litres is ৳52, where the mean of the two prices would
    // say ৳53 and let the can at the gate count as much as the tanker.
    expect(
      milkPriceOf([
        { litres: 1000, pricePerLitreBdt: 50 },
        { litres: 500, pricePerLitreBdt: 56 },
      ])
    ).toEqual({ bdtPerLitre: 52, litres: 1500 });
  });

  it("is nothing where no milk left the farm", () => {
    expect(milkPriceOf([])).toBeNull();
  });
});

describe("the litres she sent to Bulk in the days her keep is read over", () => {
  it("are read over the same weeks as her keep, and nothing before them", () => {
    const now = new Date("2040-03-01T04:00:00.000Z");
    expect(
      litresOver(
        [
          // The 30th of January is more than four weeks before the 1st of March.
          { at: new Date("2040-01-30T00:00:00.000Z"), litres: 40 },
          { at: new Date("2040-02-10T00:00:00.000Z"), litres: 12.5 },
          { at: new Date("2040-02-20T00:00:00.000Z"), litres: 7.25 },
        ],
        now,
        28
      )
    ).toBe(19.75);
  });

  it("are read over as many days as the farm says", () => {
    // A fortnight back from the 1st of March is the 16th of February: only the 20th's 7.25 litres are inside it.
    const now = new Date("2040-03-01T04:00:00.000Z");
    expect(
      litresOver(
        [
          { at: new Date("2040-02-10T00:00:00.000Z"), litres: 12.5 },
          { at: new Date("2040-02-20T00:00:00.000Z"), litres: 7.25 },
        ],
        now,
        14
      )
    ).toBe(7.25);
  });
});

describe("the soonest a cow's milk may be weighed", () => {
  it("is her calf's week and then the days her keep is read over, however many the farm reads", () => {
    // Four weeks of keep: 35 days. Six weeks: 49 — any sooner and the six weeks would take in the calf's milk.
    expect(fewestDaysBeforeMilkIsWeighed(28)).toBe(35);
    expect(fewestDaysBeforeMilkIsWeighed(42)).toBe(49);
  });
});

describe("her milk against her keep", () => {
  it("sets what her litres fetch beside what keeping her cost, and what a litre of hers costs to make", () => {
    // 280 litres in 28 days is 10 a day. At ৳55 they fetch ৳15,400 against ৳8,400 of keep: ৳7,000 over, and a
    // litre costs her ৳30 to make.
    expect(
      milkAgainstKeep({
        kept,
        litres: 280,
        daysInMilk: 90,
        weighedAfterDays: 35,
        price,
      })
    ).toEqual({
      known: true,
      days: 28,
      litres: 280,
      litresPerDay: 10,
      bdtPerLitre: 55,
      worthBdt: 15_400,
      keepBdt: 8400,
      overKeepBdt: 7000,
      costPerLitreBdt: 30,
      whole: true,
    });
  });

  it("says where her milk falls short of her keep", () => {
    // 140 litres at ৳55 is ৳7,700, ৳700 short of ৳8,400; a litre costs her ৳60 to make.
    expect(
      milkAgainstKeep({
        kept,
        litres: 140,
        daysInMilk: 200,
        weighedAfterDays: 35,
        price,
      })
    ).toMatchObject({ overKeepBdt: -700, costPerLitreBdt: 60 });
    // None at all to Bulk: every taka of her keep is short, and a litre has no cost to say.
    expect(
      milkAgainstKeep({
        kept,
        litres: 0,
        daysInMilk: 200,
        weighedAfterDays: 35,
        price,
      })
    ).toMatchObject({ worthBdt: 0, overKeepBdt: -8400, costPerLitreBdt: null });
  });

  it("does not weigh her until five weeks into her Lactation, without a Feeding charged to her, or without a price", () => {
    const at = (overrides: Partial<Parameters<typeof milkAgainstKeep>[0]>) =>
      milkAgainstKeep({
        kept,
        litres: 140,
        daysInMilk: 90,
        weighedAfterDays: 35,
        price,
        ...overrides,
      });
    expect(at({ daysInMilk: 34 })).toEqual({
      known: false,
      because: "too_soon",
    });
    expect(at({ daysInMilk: null })).toEqual({
      known: false,
      because: "too_soon",
    });
    expect(at({ kept: { ...kept, days: 6 } })).toEqual({
      known: false,
      because: "too_soon",
    });
    expect(at({ kept: { ...kept, fed: false } })).toEqual({
      known: false,
      because: "not_fed",
    });
    expect(at({ price: null })).toEqual({ known: false, because: "no_price" });
  });

  it("waits as many days into her Lactation as the farm says, and weighs her from that day on", () => {
    // A farm that waits for her peak, at 60 days, does not weigh a cow at 59; at 60 it does.
    expect(
      milkAgainstKeep({
        kept,
        litres: 140,
        daysInMilk: 59,
        weighedAfterDays: 60,
        price,
      })
    ).toEqual({ known: false, because: "too_soon" });
    expect(
      milkAgainstKeep({
        kept,
        litres: 140,
        daysInMilk: 60,
        weighedAfterDays: 60,
        price,
      })
    ).toMatchObject({ known: true, overKeepBdt: -700 });
  });
});

describe("why the farm names a cow to the Owner", () => {
  const short = milkAgainstKeep({
    kept,
    litres: 140,
    daysInMilk: 90,
    weighedAfterDays: 35,
    price,
  });
  const paying = milkAgainstKeep({
    kept,
    litres: 280,
    daysInMilk: 90,
    weighedAfterDays: 35,
    price,
  });
  const cow = {
    state: "milking",
    inCalf: false,
    daysSinceCalving: 90,
    openDays: 150,
    milk: paying as MilkAgainstKeep | null,
    repeatBreeder: false,
  };

  it("names a cow in milk whose milk falls short of her keep, but never one in calf", () => {
    expect(cullReasonsOf({ ...cow, milk: short })).toEqual(["milk_short"]);
    expect(cullReasonsOf({ ...cow, milk: short, inCalf: true })).toEqual([]);
    expect(cullReasonsOf(cow)).toEqual([]);
    // Milk not yet weighed is no reason.
    expect(
      cullReasonsOf({ ...cow, milk: { known: false, because: "no_price" } })
    ).toEqual([]);
  });

  it("names one still empty 150 days after calving, or dry and empty, and never one in calf", () => {
    expect(cullReasonsOf({ ...cow, daysSinceCalving: 150 })).toEqual([
      "open_long",
    ]);
    expect(cullReasonsOf({ ...cow, daysSinceCalving: 149 })).toEqual([]);
    expect(
      cullReasonsOf({ ...cow, daysSinceCalving: 200, inCalf: true })
    ).toEqual([]);
    expect(
      cullReasonsOf({
        ...cow,
        state: "dry",
        daysSinceCalving: null,
        milk: null,
      })
    ).toEqual(["open_long"]);
    expect(
      cullReasonsOf({ ...cow, state: "dry", inCalf: true, milk: null })
    ).toEqual([]);
  });

  it("counts empty days against the farm's own setting, not a number of its own", () => {
    // A farm that names a cow at 120 days names one at 121 that a farm at 150 would leave be.
    expect(
      cullReasonsOf({ ...cow, daysSinceCalving: 121, openDays: 120 })
    ).toEqual(["open_long"]);
    expect(
      cullReasonsOf({ ...cow, daysSinceCalving: 121, openDays: 150 })
    ).toEqual([]);
  });

  it("names a Repeat Breeder, a heifer among them, and says every reason a cow has in one order", () => {
    expect(
      cullReasonsOf({
        state: "heifer",
        inCalf: false,
        daysSinceCalving: null,
        openDays: 150,
        milk: null,
        repeatBreeder: true,
      })
    ).toEqual(["repeat_breeder"]);
    expect(
      cullReasonsOf({
        ...cow,
        milk: short,
        daysSinceCalving: 200,
        repeatBreeder: true,
      })
    ).toEqual(["milk_short", "open_long", "repeat_breeder"]);
  });
});

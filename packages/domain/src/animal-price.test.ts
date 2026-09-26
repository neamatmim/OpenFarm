import { describe, expect, it } from "vitest";

import { perKgOfSales, priceOfAnimal, priceRangeFor } from "./animal-price";

describe("what an animal might fetch against what she cost", () => {
  it("prices her latest weight at both ends, and says what each leaves over her cost", () => {
    // 228 kg, and ৳60,000 spent on her. At ৳500 a kilo she fetches ৳1,14,000, ৳54,000 over; at ৳600,
    // ৳1,36,800, ৳76,800 over. She pays for herself at ৳263.16 a kilo.
    expect(
      priceOfAnimal({
        costBdt: 60_000,
        latestKg: 228,
        range: { lowBdtPerKg: 500, highBdtPerKg: 600 },
      })
    ).toEqual({
      breakEvenBdtPerKg: 263.16,
      low: { priceBdt: 114_000, marginBdt: 54_000 },
      high: { priceBdt: 136_800, marginBdt: 76_800 },
    });
  });

  it("says a loss where a price does not cover her", () => {
    const priced = priceOfAnimal({
      costBdt: 150_000,
      latestKg: 250,
      range: { lowBdtPerKg: 500, highBdtPerKg: 700 },
    });
    // ৳1,25,000 at the low price is ৳25,000 short of what she cost.
    expect(priced.low?.marginBdt).toBe(-25_000);
    expect(priced.breakEvenBdtPerKg).toBe(600);
  });

  it("gives a break-even but no price while no price a kilo is set, and neither without a weight", () => {
    expect(
      priceOfAnimal({ costBdt: 60_000, latestKg: 240, range: null })
    ).toEqual({ breakEvenBdtPerKg: 250, low: null, high: null });
    expect(
      priceOfAnimal({
        costBdt: 60_000,
        latestKg: null,
        range: { lowBdtPerKg: 500, highBdtPerKg: 600 },
      })
    ).toEqual({ breakEvenBdtPerKg: null, low: null, high: null });
  });
});

describe("the price a kilo an animal is priced at", () => {
  const venture = { lowBdtPerKg: 550, highBdtPerKg: 650 };
  const farm = { lowBdtPerKg: 500, highBdtPerKg: 600 };

  it("is her Venture's own for one of a Venture's animals, and the farm's market price for the farm's own", () => {
    expect(
      priceRangeFor({ ofHerVenture: venture, market: farm, inAVenture: true })
    ).toEqual({ ...venture, from: "venture" });
    expect(
      priceRangeFor({ ofHerVenture: null, market: farm, inAVenture: false })
    ).toEqual({ ...farm, from: "market" });
  });

  it("never prices a Venture's animal at the farm's market price: its prices are the Venture's to set", () => {
    expect(
      priceRangeFor({ ofHerVenture: null, market: farm, inAVenture: true })
    ).toBeNull();
    expect(
      priceRangeFor({ ofHerVenture: null, market: null, inAVenture: false })
    ).toBeNull();
  });
});

describe("what a kilo fetched in the farm's own sales", () => {
  it("is everything they fetched over everything they weighed, not the mean of each one's rate", () => {
    // ৳1,00,000 for 200 kg (৳500) and ৳3,60,000 for 600 kg (৳600): ৳4,60,000 over 800 kg is ৳575 a kilo, where the
    // mean of the two rates would say ৳550 and let the small bull count as much as the big one.
    expect(
      perKgOfSales([
        { priceBdt: 100_000, weightKg: 200 },
        { priceBdt: 360_000, weightKg: 600 },
      ])
    ).toEqual({ bdtPerKg: 575, animals: 2 });
  });

  it("says nothing where nothing was sold, or nothing weighed", () => {
    expect(perKgOfSales([])).toBeNull();
    expect(perKgOfSales([{ priceBdt: 100_000, weightKg: 0 }])).toBeNull();
  });
});

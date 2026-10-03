import { describe, expect, it } from "vitest";

import type { Kept } from "./animal-price";
import {
  keepOrSell,
  keepRateOf,
  keptOver,
  perKgOfSales,
  priceOfAnimal,
  priceRangeFor,
} from "./animal-price";

describe("what an animal might fetch against what she cost", () => {
  it("prices her latest weight at both ends, and says what each leaves over her cost", () => {
    // 228 kg, and ৳60,000 spent on her. At ৳500 a kilo she fetches ৳1,14,000, ৳54,000 over; at ৳600,
    // ৳1,36,800, ৳76,800 over. She pays for herself at ৳263.16 a kilo.
    expect(
      priceOfAnimal({
        costMoney: 60_000,
        latestKg: 228,
        range: { lowMoneyPerKg: 500, highMoneyPerKg: 600 },
      })
    ).toEqual({
      breakEvenMoneyPerKg: 263.16,
      low: { priceMoney: 114_000, marginMoney: 54_000 },
      high: { priceMoney: 136_800, marginMoney: 76_800 },
    });
  });

  it("says a loss where a price does not cover her", () => {
    const priced = priceOfAnimal({
      costMoney: 150_000,
      latestKg: 250,
      range: { lowMoneyPerKg: 500, highMoneyPerKg: 700 },
    });
    // ৳1,25,000 at the low price is ৳25,000 short of what she cost.
    expect(priced.low?.marginMoney).toBe(-25_000);
    expect(priced.breakEvenMoneyPerKg).toBe(600);
  });

  it("gives a break-even but no price while no price a kilo is set, and neither without a weight", () => {
    expect(
      priceOfAnimal({ costMoney: 60_000, latestKg: 240, range: null })
    ).toEqual({ breakEvenMoneyPerKg: 250, low: null, high: null });
    expect(
      priceOfAnimal({
        costMoney: 60_000,
        latestKg: null,
        range: { lowMoneyPerKg: 500, highMoneyPerKg: 600 },
      })
    ).toEqual({ breakEvenMoneyPerKg: null, low: null, high: null });
  });
});

describe("the price a kilo an animal is priced at", () => {
  const venture = { lowMoneyPerKg: 550, highMoneyPerKg: 650 };
  const farm = { lowMoneyPerKg: 500, highMoneyPerKg: 600 };

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
        { priceMoney: 100_000, weightKg: 200 },
        { priceMoney: 360_000, weightKg: 600 },
      ])
    ).toEqual({ moneyPerKg: 575, animals: 2 });
  });

  it("says nothing where nothing was sold, or nothing weighed", () => {
    expect(perKgOfSales([])).toBeNull();
    expect(perKgOfSales([{ priceMoney: 100_000, weightKg: 0 }])).toBeNull();
  });
});

/** Her share of one morning's Feeding. */
const feeding = (day: string, amount: number, priced = true) => ({
  at: new Date(`${day}T02:00:00.000Z`),
  amount,
  fed: true,
  priced,
});

describe("what her keep has cost over the days the farm reads it over", () => {
  // Four weeks back from the 1st of March is the 2nd of February, at the same hour.
  const now = new Date("2040-03-01T04:00:00.000Z");
  const here = [{ from: new Date("2040-01-02T04:00:00.000Z"), until: null }];

  it("adds up what was charged to her inside the four weeks, and nothing from before them", () => {
    const kept = keptOver({
      charges: [
        // January's sack is long eaten: none of this fortnight's keep.
        feeding("2040-01-20", 3000),
        feeding("2040-02-10", 4200),
        feeding("2040-02-24", 4200),
        {
          at: new Date("2040-02-15T00:00:00.000Z"),
          amount: 140,
          fed: false,
          priced: true,
        },
      ],
      stood: here,
      now,
      readDays: 28,
    });
    expect(kept).toEqual({ amount: 8540, days: 28, fed: true, whole: true });
  });

  it("reads as many days back as the farm says", () => {
    // A fortnight back from the 1st of March is the 16th of February: the 10th's feeding and the 15th's Herd Cost are
    // before it, the 24th's feeding inside it.
    expect(
      keptOver({
        charges: [
          feeding("2040-02-10", 4200),
          feeding("2040-02-24", 4200),
          {
            at: new Date("2040-02-15T00:00:00.000Z"),
            amount: 140,
            fed: false,
            priced: true,
          },
        ],
        stood: here,
        now,
        readDays: 14,
      })
    ).toEqual({ amount: 4200, days: 14, fed: true, whole: true });
  });

  it("counts only the days she was here, and a move between Pens is no gap", () => {
    // Ten days off the lorry.
    expect(
      keptOver({
        charges: [feeding("2040-02-25", 1000)],
        stood: [{ from: new Date("2040-02-20T04:00:00.000Z"), until: null }],
        now,
        readDays: 28,
      }).days
    ).toBe(10);
    // Moved on the 20th of February from one Pen to the next: still four weeks of her.
    expect(
      keptOver({
        charges: [],
        stood: [
          {
            from: new Date("2040-01-02T04:00:00.000Z"),
            until: new Date("2040-02-20T04:00:00.000Z"),
          },
          { from: new Date("2040-02-20T04:00:00.000Z"), until: null },
        ],
        now,
        readDays: 28,
      }).days
    ).toBe(28);
  });

  it("says when she was never fed in them, and when some of her feed had no price", () => {
    const herdOnly = keptOver({
      charges: [
        {
          at: new Date("2040-02-15T00:00:00.000Z"),
          amount: 140,
          fed: false,
          priced: true,
        },
      ],
      stood: here,
      now,
      readDays: 28,
    });
    expect(herdOnly.fed).toBe(false);
    const grass = keptOver({
      charges: [feeding("2040-02-10", 4200), feeding("2040-02-11", 0, false)],
      stood: here,
      now,
      readDays: 28,
    });
    expect(grass).toMatchObject({ fed: true, whole: false });
  });
});

describe("keep her or sell her", () => {
  // ৳8,400 of keep over four weeks is ৳300 a day.
  const kept: Kept = { amount: 8400, days: 28, fed: true, whole: true };

  it("sets what a kilo she puts on now costs beside her price, and works the next fortnight at both ends", () => {
    // A kilo a day on ৳300 a day: each kilo costs ৳300. At ৳280 to ৳320 a kilo that is between the two, so what she
    // fetches decides. The next fortnight: 14 kg for ৳4,200 of keep, fetching ৳3,920 at ৳280 (৳280 short) and ৳4,480
    // at ৳320 (৳280 over).
    expect(
      keepOrSell({
        kept,
        dailyGainKg: 1,
        range: { lowMoneyPerKg: 280, highMoneyPerKg: 320 },
        aheadDays: 14,
        needsDays: 7,
      })
    ).toEqual({
      known: true,
      keepMoneyPerDay: 300,
      dailyGainKg: 1,
      costOfGainNowMoney: 300,
      ahead: {
        days: 14,
        gainKg: 14,
        keepMoney: 4200,
        low: { worthMoney: 3920, overKeepMoney: -280 },
        high: { worthMoney: 4480, overKeepMoney: 280 },
      },
      keeping: "close",
      whole: true,
    });
  });

  it("works as many days ahead as the farm says, and the verdict does not move with them", () => {
    // A week ahead at ৳300 a day and a kilo a day: 7 kg for ৳2,100 of keep, fetching ৳1,960 at ৳280 (৳140 short) and
    // ৳2,240 at ৳320 (৳140 over). What a kilo costs to put on is the same ৳300 however far ahead it is worked.
    expect(
      keepOrSell({
        kept,
        dailyGainKg: 1,
        range: { lowMoneyPerKg: 280, highMoneyPerKg: 320 },
        aheadDays: 7,
        needsDays: 7,
      })
    ).toMatchObject({
      costOfGainNowMoney: 300,
      ahead: {
        days: 7,
        gainKg: 7,
        keepMoney: 2100,
        low: { worthMoney: 1960, overKeepMoney: -140 },
        high: { worthMoney: 2240, overKeepMoney: 140 },
      },
      keeping: "close",
    });
  });

  it("says keeping pays when a kilo costs no more than the low price, and costs more when it costs over the high", () => {
    const at = (lowMoneyPerKg: number, highMoneyPerKg: number) =>
      keepOrSell({
        kept,
        dailyGainKg: 1,
        range: { lowMoneyPerKg, highMoneyPerKg },
        aheadDays: 14,
        needsDays: 7,
      });
    const pays = at(300, 360);
    const costsMore = at(250, 290);
    // A kilo at ৳300 against a low price of ৳300: it pays, if by nothing.
    expect(pays.known && pays.keeping).toBe("pays");
    expect(costsMore.known && costsMore.keeping).toBe("costs_more");
  });

  it("says a beast putting nothing on, or losing, costs more to keep at any price", () => {
    const range = { lowMoneyPerKg: 500, highMoneyPerKg: 700 };
    const still = keepOrSell({
      kept,
      dailyGainKg: 0,
      range,
      aheadDays: 14,
      needsDays: 7,
    });
    expect(still).toMatchObject({
      known: true,
      costOfGainNowMoney: null,
      keeping: "costs_more",
      ahead: {
        gainKg: 0,
        keepMoney: 4200,
        low: { worthMoney: 0, overKeepMoney: -4200 },
      },
    });
    const losing = keepOrSell({
      kept,
      dailyGainKg: -0.5,
      range,
      aheadDays: 14,
      needsDays: 7,
    });
    // Half a kilo a day off her for a fortnight is 7 kg gone, and ৳4,200 spent on it.
    expect(losing).toMatchObject({
      keeping: "costs_more",
      ahead: { gainKg: -7, low: { worthMoney: -3500, overKeepMoney: -7700 } },
    });
  });

  it("works what a day costs and what a kilo costs to the paisa, and says what the fortnight's keep comes to", () => {
    // ৳10,000 over 28 days is ৳357.142857… a day, ৳5,000 a fortnight. At 0.85 kg a day each kilo costs ৳420.17, between
    // ৳400 and ৳450. The fortnight's 11.9 kg fetch ৳4,760 (৳240 short of its keep) and ৳5,355 (৳355 over).
    expect(
      keepOrSell({
        kept: { amount: 10_000, days: 28, fed: true, whole: false },
        dailyGainKg: 0.85,
        range: { lowMoneyPerKg: 400, highMoneyPerKg: 450 },
        aheadDays: 14,
        needsDays: 7,
      })
    ).toEqual({
      known: true,
      keepMoneyPerDay: 357.14,
      dailyGainKg: 0.85,
      costOfGainNowMoney: 420.17,
      ahead: {
        days: 14,
        gainKg: 11.9,
        keepMoney: 5000,
        low: { worthMoney: 4760, overKeepMoney: -240 },
        high: { worthMoney: 5355, overKeepMoney: 355 },
      },
      keeping: "close",
      whole: false,
    });
  });

  it("gives the figures but no verdict while no price a kilo is set for her", () => {
    expect(
      keepOrSell({
        kept,
        dailyGainKg: 1,
        range: null,
        aheadDays: 14,
        needsDays: 7,
      })
    ).toMatchObject({
      known: true,
      costOfGainNowMoney: 300,
      keeping: null,
      ahead: { low: null, high: null },
    });
  });

  it("judges an animal as soon as the farm says she has been here long enough", () => {
    // Five days of her at ৳300 a day: a farm that waits a week cannot tell yet, one that waits three days can.
    const fiveDays = { ...kept, amount: 1500, days: 5 };
    const range = { lowMoneyPerKg: 280, highMoneyPerKg: 320 };
    expect(
      keepOrSell({
        kept: fiveDays,
        dailyGainKg: 1,
        range,
        aheadDays: 14,
        needsDays: 7,
      })
    ).toEqual({ known: false, because: "too_new" });
    expect(
      keepOrSell({
        kept: fiveDays,
        dailyGainKg: 1,
        range,
        aheadDays: 14,
        needsDays: 3,
      })
    ).toMatchObject({ known: true, keepMoneyPerDay: 300, keeping: "close" });
  });

  it("says why it cannot tell: too few days here, no Feeding charged to her, or no rate to work from", () => {
    const range = { lowMoneyPerKg: 500, highMoneyPerKg: 700 };
    expect(
      keepOrSell({
        kept: { ...kept, days: 6.9 },
        dailyGainKg: 1,
        range,
        aheadDays: 14,
        needsDays: 7,
      })
    ).toEqual({ known: false, because: "too_new" });
    expect(
      keepOrSell({
        kept: { ...kept, fed: false },
        dailyGainKg: 1,
        range,
        aheadDays: 14,
        needsDays: 7,
      })
    ).toEqual({ known: false, because: "not_fed" });
    expect(
      keepOrSell({
        kept,
        dailyGainKg: null,
        range,
        aheadDays: 14,
        needsDays: 7,
      })
    ).toEqual({
      known: false,
      because: "no_rate",
    });
  });
});

describe("the daily gain keeping her is weighed on", () => {
  it("is between her last two readings, where they are a week apart or more", () => {
    // Fortnightly readings: the last fortnight's rate, though she did better over her whole stay.
    expect(
      keepRateOf(
        { dailyGainKg: 0.4, overDays: 14 },
        { dailyGainKg: 0.9, overDays: 90 },
        7
      )
    ).toBe(0.4);
  });

  it("is her gain since she came where the last two readings are under a week apart, and nothing short of a week", () => {
    // Weighed again three days on: 0.33 kg a day is what the scale said of a full gut, not of three days' growth.
    expect(
      keepRateOf(
        { dailyGainKg: 0.33, overDays: 3 },
        { dailyGainKg: 0.57, overDays: 92 },
        7
      )
    ).toBe(0.57);
    expect(keepRateOf(null, { dailyGainKg: 1.2, overDays: 5 }, 7)).toBeNull();
    expect(keepRateOf(null, null, 7)).toBeNull();
  });

  it("trusts two readings as close together as the farm says, and no closer", () => {
    // Weighed three days apart: a farm that trusts a three-day gap reads her last three days; one that wants a week
    // reads her whole stay.
    const recent = { dailyGainKg: 0.33, overDays: 3 };
    const sinceIntake = { dailyGainKg: 0.57, overDays: 92 };
    expect(keepRateOf(recent, sinceIntake, 3)).toBe(0.33);
    expect(keepRateOf(recent, sinceIntake, 7)).toBe(0.57);
  });
});

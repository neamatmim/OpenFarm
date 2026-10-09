import { describe, expect, it } from "vitest";

import { capitalEmployedOf, monthsReturnOf } from "./capital-employed";

const on = (day: string) => new Date(`${day}T00:00:00.000Z`);
const AT = on("2046-06-01");
const charge = (day: string, amount: number) => ({ at: on(day), amount });

describe("the money the Farm had tied up, at cost", () => {
  it("is a fattening animal's price and every charge to her before the moment", () => {
    const capital = capitalEmployedOf({
      at: AT,
      animals: [
        {
          side: "fattening",
          takenOnMoney: 50_000,
          charges: [charge("2046-05-05", 3000), charge("2046-06-02", 900)],
          firstCalvedAt: null,
        },
      ],
      venturesMoney: 0,
      storeMoney: 0,
      receivablesMoney: 0,
    });
    expect(capital.fatteningMoney).toBe(53_000);
  });

  it("is a dairy animal's entry price and what she was charged until she first calved — after that her keep is the milk's", () => {
    const capital = capitalEmployedOf({
      at: AT,
      animals: [
        // Bred here: nothing to take on, her calf and heifer keep until she calved on 1 May.
        {
          side: "dairy",
          takenOnMoney: 0,
          charges: [charge("2046-03-01", 20_000), charge("2046-05-10", 4000)],
          firstCalvedAt: on("2046-05-01"),
        },
        // Bought, not yet calved: her price and all of her keep so far.
        {
          side: "dairy",
          takenOnMoney: 70_000,
          charges: [charge("2046-05-10", 2500)],
          firstCalvedAt: null,
        },
      ],
      venturesMoney: 0,
      storeMoney: 0,
      receivablesMoney: 0,
    });
    expect(capital.dairyMoney).toBe(92_500);
  });

  it("counts one with no price at nothing, and says how many there were", () => {
    const capital = capitalEmployedOf({
      at: AT,
      animals: [
        {
          side: "dairy",
          takenOnMoney: null,
          charges: [charge("2046-05-10", 1000)],
          firstCalvedAt: on("2045-01-01"),
        },
      ],
      venturesMoney: 0,
      storeMoney: 0,
      receivablesMoney: 0,
    });
    expect(capital).toMatchObject({ dairyMoney: 0, unpricedDairy: 1 });
  });

  it("adds the Farm Capital in Ventures, the store and what buyers owe", () => {
    expect(
      capitalEmployedOf({
        at: AT,
        animals: [],
        venturesMoney: 100_000,
        storeMoney: 45_000,
        receivablesMoney: 36_000,
      })
    ).toEqual({
      dairyMoney: 0,
      fatteningMoney: 0,
      venturesMoney: 100_000,
      storeMoney: 45_000,
      receivablesMoney: 36_000,
      totalMoney: 181_000,
      unpricedDairy: 0,
    });
  });
});

describe("what the capital made in a month", () => {
  const capital = (dairyMoney: number, fatteningMoney: number) =>
    capitalEmployedOf({
      at: AT,
      animals: [
        {
          side: "dairy",
          takenOnMoney: dairyMoney,
          charges: [],
          firstCalvedAt: null,
        },
        {
          side: "fattening",
          takenOnMoney: fatteningMoney,
          charges: [],
          firstCalvedAt: null,
        },
      ],
      venturesMoney: 500_000,
      storeMoney: 0,
      receivablesMoney: 0,
    });

  it("is a Side's result after overheads over the mean of its capital at the month's start and end, for every hundred taka", () => {
    // Dairy: ৳2,200 over a mean of ৳110,000 is ৳2 a hundred. Fattening: ৳22,500 over ৳150,000 is ৳15.
    // The Farm: ৳23,700 over its own Sides' ৳260,000, the Ventures' capital apart, is ৳9.1.
    expect(
      monthsReturnOf(
        { dairy: 2200, fattening: 22_500, farm: 23_700 },
        capital(100_000, 200_000),
        capital(120_000, 100_000)
      )
    ).toEqual({ dairyPer100: 2, fatteningPer100: 15, farmPer100: 9.1 });
  });

  it("says nothing over no capital", () => {
    expect(
      monthsReturnOf(
        { dairy: 2200, fattening: 0, farm: 2200 },
        capital(0, 0),
        capital(0, 0)
      )
    ).toEqual({ dairyPer100: null, fatteningPer100: null, farmPer100: null });
  });
});

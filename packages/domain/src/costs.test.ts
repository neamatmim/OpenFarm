import { describe, expect, it } from "vitest";

import {
  costOfGainOf,
  costPerLitreOf,
  dosePriceOf,
  feedShares,
  herdShares,
  marginOf,
  monthOf,
  roundedCosts,
  tripShares,
} from "./costs";
import type { Costs, FeedingToCost } from "./costs";
import { startOfFarmDay } from "./farm-clock";
import type { PenHistoryLine } from "./pen-history";

// What the farm spent, charged to the animals it was spent on. Every rule here is one somebody has to be
// able to answer an Investor with — why his beast carries this much of a lorry, of a month's medicine,
// of a sack of ভুসি — so each is asserted on its own rather than through a total that hides it.

/** An instant on the farm's own clock, which is six hours ahead of UTC. */
const on = (day: string, time = "12:00") =>
  new Date(`2027-${day}T${time}:00+06:00`);

/** খড় is cut on the farm and has no price; ভুসি was bought at 50 a kilo. */
const priceOf = (feedItemId: string) => (feedItemId === "ভুসি" ? 50 : null);

const standing = (
  animalId: string,
  penId: string,
  side: PenHistoryLine["side"],
  from: Date,
  until: Date | null = null
): PenHistoryLine => ({ animalId, penId, side, from, until });

describe("what an outing cost, charged to the animals it carried", () => {
  const trip = { id: "t1", at: on("03-02"), costBdt: 9000 };
  const carried = ["১০১", "১০২", "১০৩"].map((animalId) => ({
    animalId,
    tripId: "t1",
    side: "fattening" as const,
    at: on("03-02"),
  }));

  it("splits it evenly, because the lorry was hired for all of them and not for one", () => {
    const { shares, unallocated } = tripShares({ trips: [trip], carried });
    expect(shares.map((one) => one.bdt)).toEqual([3000, 3000, 3000]);
    expect(shares.map((one) => one.fromId)).toEqual(["t1", "t1", "t1"]);
    expect(unallocated).toEqual([]);
  });

  it("charges an outing nobody came home on to nobody, and says so", () => {
    const { shares, unallocated } = tripShares({ trips: [trip], carried: [] });
    expect(shares).toEqual([]);
    expect(unallocated).toEqual([{ at: trip.at, bdt: 9000 }]);
  });

  it("says nothing at all about an outing that cost nothing", () => {
    const free = { id: "t2", at: on("03-02"), costBdt: 0 };
    expect(tripShares({ trips: [free], carried: [] })).toEqual({
      shares: [],
      unallocated: [],
    });
  });
});

describe("a month's marked money, charged by the days each beast stood here", () => {
  // March 2027 has 31 days, so 4,600 taka over 46 animal-days is a round 100 a day: she who stood all
  // month carries 3,100 and she who came on the 17th carries 1,500.
  const cost = {
    at: on("03-10"),
    side: "fattening" as const,
    bdt: 4600,
    categoryId: "ওষুধ",
  };
  const history = [
    standing("১০১", "p1", "fattening", on("02-01")),
    standing("১০২", "p1", "fattening", startOfFarmDay("2027-03-17")),
    // Sold in February: she was not here for any of this month.
    standing("১০৩", "p1", "fattening", on("01-05"), on("02-20")),
    // Standing all month, but on the other Side, and this money was marked against fattening.
    standing("২০১", "p2", "dairy", on("01-01")),
  ];

  it("gives each her days and no more", () => {
    const { shares } = herdShares({ costs: [cost], history });
    expect(shares.map((one) => [one.animalId, one.bdt] as const)).toEqual([
      ["১০১", 3100],
      ["১০২", 1500],
    ]);
  });

  it("dates a share no earlier than the day she arrived", () => {
    const { shares } = herdShares({ costs: [cost], history });
    // The one who was already here carries it from the day the money was spent; the one who came later
    // carries it from the day she came, so it is never read into weeks she had nothing to do with.
    expect(shares.map((one) => one.at)).toEqual([
      cost.at,
      startOfFarmDay("2027-03-17"),
    ]);
  });

  it("names the Category the Owner marked it against", () => {
    const { shares } = herdShares({ costs: [cost], history });
    expect(shares.every((one) => one.fromId === "ওষুধ")).toBe(true);
  });

  it("charges a month nobody was standing in to nobody, and says so", () => {
    const later = { ...cost, at: on("12-10") };
    const { shares, unallocated } = herdShares({
      costs: [later],
      // Everyone had gone by December.
      history: [standing("১০১", "p1", "fattening", on("02-01"), on("06-01"))],
    });
    expect(shares).toEqual([]);
    expect(unallocated).toEqual([{ at: later.at, bdt: 4600 }]);
  });
});

describe("what a Pen was fed, charged to the animals that ate it", () => {
  const fed: FeedingToCost = {
    penId: "p1",
    fedAt: on("03-05"),
    lines: [
      { feedItemId: "খড়", givenKg: 10 },
      { feedItemId: "ভুসি", givenKg: 4 },
    ],
  };
  const history = [
    standing("১০১", "p1", "fattening", on("02-01")),
    standing("১০২", "p1", "fattening", on("02-01")),
  ];

  it("splits each Feed Item evenly across those standing in the Pen, one share per item", () => {
    const { shares } = feedShares({ feedings: [fed], history, priceOf });
    expect(
      shares.map((one) => [one.animalId, one.feedItemId, one.feedBdt] as const)
    ).toEqual([
      ["১০১", "খড়", 0],
      ["১০২", "খড়", 0],
      ["১০১", "ভুসি", 100],
      ["১০২", "ভুসি", 100],
    ]);
  });

  it("charges nothing for fodder the farm never paid for, and still says how much of it there was", () => {
    const { shares } = feedShares({ feedings: [fed], history, priceOf });
    const hay = shares.filter((one) => one.feedItemId === "খড়");
    expect(hay.map((one) => one.unpricedKg)).toEqual([5, 5]);
    expect(hay.map((one) => one.feedBdt)).toEqual([0, 0]);
  });

  it("charges a Feeding nobody was standing for to nobody, and says so rather than spreading it", () => {
    const elsewhere = { ...fed, penId: "p9" };
    const { shares, unallocated } = feedShares({
      feedings: [elsewhere],
      history,
      priceOf,
    });
    expect(shares).toEqual([]);
    expect(unallocated).toEqual([
      { at: elsewhere.fedAt, feedBdt: 200, unpricedKg: 10 },
    ]);
  });
});

describe("what one dose of a product cost", () => {
  const purchases = [
    { id: "a", purchasedOn: on("01-01"), priceBdt: 300, doses: 10 },
    { id: "b", purchasedOn: on("02-01"), priceBdt: 400, doses: 10 },
    { id: "c", purchasedOn: on("03-01"), priceBdt: 500, doses: 10 },
  ];

  it("is what its latest purchases cost, over the doses they held", () => {
    // 1,200 taka bought 30 doses.
    expect(dosePriceOf(purchases, on("03-15"))).toBe(40);
  });

  it("looks no further back than three purchases", () => {
    // A cheap old lot must not drag the price of a dose given today.
    const older = [
      { id: "z", purchasedOn: on("01-01", "06:00"), priceBdt: 30, doses: 10 },
      ...purchases,
    ];
    expect(dosePriceOf(older, on("03-15"))).toBe(40);
  });

  it("does not cost a dose by what the farm bought after giving it", () => {
    const later = [
      ...purchases,
      { id: "d", purchasedOn: on("04-01"), priceBdt: 900, doses: 10 },
    ];
    expect(dosePriceOf(later, on("03-15"))).toBe(40);
  });

  it("is nothing at all for a product the farm had not bought by then", () => {
    // Uncosted, never free.
    expect(dosePriceOf(purchases, new Date("2026-11-01T06:00:00+06:00"))).toBe(
      null
    );
  });
});

describe("the month money belongs to", () => {
  it("runs December into the next January rather than a thirteenth month", () => {
    expect(monthOf(on("12-20"))).toEqual({
      from: startOfFarmDay("2027-12-01"),
      until: startOfFarmDay("2028-01-01"),
    });
  });

  it("is the farm's own month, not UTC's", () => {
    // Seven in the evening UTC on the last of January is already the first of February in Savar, and a
    // farm that read its calendar in UTC would charge the money to the wrong month.
    expect(monthOf(new Date("2027-01-31T19:00:00.000Z"))).toEqual({
      from: startOfFarmDay("2027-02-01"),
      until: startOfFarmDay("2027-03-01"),
    });
  });
});

describe("what she came to, once she is sold", () => {
  // 3,000 taka of keep: feed, doses, the Vet, the haat, the lorries and her share of the month.
  const costs: Costs = {
    feedBdt: 1000,
    unpricedKg: 5,
    medicineBdt: 200,
    uncostedDoses: 1,
    vetBdt: 300,
    hasilBdt: 500,
    tripBdt: 400,
    herdBdt: 600,
  };

  it("is her sale less what she was bought for and everything she cost", () => {
    expect(marginOf({ costs, purchaseBdt: 50_000, saleBdt: 62_000 })).toBe(
      9000
    );
  });

  it("is nothing at all until she is sold", () => {
    expect(marginOf({ costs, purchaseBdt: 50_000, saleBdt: null })).toBe(null);
  });

  it("counts a beast bred on the farm as bought for nothing", () => {
    expect(marginOf({ costs, purchaseBdt: null, saleBdt: 62_000 })).toBe(
      59_000
    );
  });

  it("costs her gain over the kilos she put on, and says nothing for one who has not gained", () => {
    expect(costOfGainOf(costs, 120)).toBe(25);
    expect(costOfGainOf(costs, 0)).toBe(null);
    expect(costOfGainOf(costs, null)).toBe(null);
  });

  it("costs a cow's litres over what she sent to Bulk, and says nothing for none sent", () => {
    expect(costPerLitreOf(costs, 1500)).toBe(2);
    expect(costPerLitreOf(costs, 0)).toBe(null);
  });

  it("reads her costs to the poisha, and leaves the uncosted doses as the count they are", () => {
    const rounded = roundedCosts({
      ...costs,
      feedBdt: 1000.126,
      vetBdt: 0.005,
    });
    expect(rounded.feedBdt).toBe(1000.13);
    expect(rounded.vetBdt).toBe(0.01);
    expect(rounded.uncostedDoses).toBe(1);
  });
});

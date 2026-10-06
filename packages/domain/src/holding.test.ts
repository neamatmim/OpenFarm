import { describe, expect, it } from "vitest";

import { startOfFarmDay } from "./farm-clock";
import type {
  Charge,
  ChargeKind,
  Holding,
  OwnedThenBy,
  WhatHappened,
} from "./holding";
import {
  EVERY_CHARGE,
  HER_KEEP,
  WHAT_THE_FARM_IS_OWED,
  chargesInHolding,
  chargesOfOwner,
  costsOf,
  howSheLeft,
} from "./holding";

// Bull ১০১ comes off the lorry for the Farm on 4 January 2030 and is sold by Internal Sale to Venture v1 on the 20th,
// saved at ten in the morning. He is v1's from the start of the 20th. Sold at the livestock market on 15 February.
const arrived = new Date("2030-01-04T05:00:00.000Z");
const saleDay = startOfFarmDay("2030-01-20");
const sold = new Date("2030-02-15T05:00:00.000Z");

const ownedThenBy: OwnedThenBy = (_animalId, at) =>
  at >= saleDay ? "v1" : null;

const farms: Holding = {
  animalId: "১০১",
  owner: null,
  side: "fattening",
  from: arrived,
  until: saleDay,
};
const ventures: Holding = {
  animalId: "১০১",
  owner: "v1",
  side: "fattening",
  from: saleDay,
  until: sold,
};

const charge = (
  kind: ChargeKind,
  at: string | Date,
  amount: number,
  more: Partial<Charge> = {}
): Charge => ({
  kind,
  animalId: "১০১",
  side: "fattening",
  at: typeof at === "string" ? new Date(at) : at,
  amount,
  fromId: kind,
  unpricedKg: 0,
  priced: true,
  ...more,
});

const hisCharges = [
  charge("market_toll", arrived, 500),
  charge("buying_trip", arrived, 1200),
  charge("feed", "2030-01-10T02:00:00.000Z", 3000),
  // The Vet's fee for a visit on the day he changed hands is dated the start of that day: the buyer's.
  charge("vet", saleDay, 1500),
  charge("feed", "2030-01-25T02:00:00.000Z", 4000),
  charge("herd", "2030-01-31T12:00:00.000Z", 900),
  charge("selling_trip", "2030-02-14T18:00:00.000Z", 700),
];

const total = (charges: readonly Charge[]) =>
  charges.reduce((sum, one) => sum + one.amount, 0);

describe("the charges inside a Holding", () => {
  it("add up across his Holdings to everything he was charged, nothing lost and nothing twice", () => {
    const his = [farms, ventures].flatMap((holding) =>
      chargesInHolding(hisCharges, holding, ownedThenBy)
    );
    expect(total(his)).toBe(total(hisCharges));
    expect(his).toHaveLength(hisCharges.length);
  });

  it("give a charge on the moment he changed hands to the buyer alone", () => {
    const vet = (holding: Holding) =>
      chargesInHolding(hisCharges, holding, ownedThenBy).filter(
        (one) => one.kind === "vet"
      );
    expect(vet(farms)).toEqual([]);
    expect(vet(ventures)).toHaveLength(1);
  });

  it("leave out a charge from before he was taken on or after he left", () => {
    const early = charge("feed", "2030-01-03T02:00:00.000Z", 100);
    const late = charge("feed", "2030-02-16T02:00:00.000Z", 100);
    expect(chargesInHolding([early, late], ventures, ownedThenBy)).toEqual([]);
    expect(chargesInHolding([early, late], farms, ownedThenBy)).toEqual([]);
  });

  it("run on to today while he stands", () => {
    const standing = { ...ventures, until: null };
    const later = charge("feed", "2031-06-01T02:00:00.000Z", 100);
    expect(chargesInHolding([later], standing, ownedThenBy)).toEqual([later]);
  });

  it("keep to the Side the Holding is on", () => {
    // A heifer's Dairy days are her Dairy Holding's; once she crosses to Fattening they are another Holding's.
    const onDairy = charge("feed", "2030-01-10T02:00:00.000Z", 300, {
      side: "dairy",
    });
    expect(chargesInHolding([onDairy], farms, ownedThenBy)).toEqual([]);
    expect(
      chargesInHolding([onDairy], { ...farms, side: "dairy" }, ownedThenBy)
    ).toEqual([onDairy]);
  });

  it("are only another animal's if they are hers", () => {
    const hers = charge("feed", "2030-01-10T02:00:00.000Z", 300, {
      animalId: "১০২",
    });
    expect(chargesInHolding([hers], farms, ownedThenBy)).toEqual([]);
  });
});

describe("an owner's charges", () => {
  it("are those of the animals that were theirs on the day", () => {
    expect(total(chargesOfOwner(hisCharges, "v1", ownedThenBy))).toBe(
      1500 + 4000 + 900 + 700
    );
    expect(total(chargesOfOwner(hisCharges, null, ownedThenBy))).toBe(
      500 + 1200 + 3000
    );
  });

  it("are what the Farm is owed back without the Market toll or the Buying Trip, which its own Float paid", () => {
    const owed = chargesOfOwner(
      [
        ...hisCharges,
        charge("market_toll", saleDay, 50),
        charge("buying_trip", saleDay, 60),
      ],
      "v1",
      ownedThenBy,
      WHAT_THE_FARM_IS_OWED
    );
    expect(owed.map((one) => one.kind).toSorted()).toEqual([
      "feed",
      "herd",
      "selling_trip",
      "vet",
    ]);
  });
});

describe("the kinds each sum counts", () => {
  it("counts every kind for a Settlement, a Return and a Margin", () => {
    expect([...EVERY_CHARGE]).toHaveLength(8);
  });

  it("counts a broker at a Sale among what the Farm is owed, as a Selling Trip", () => {
    expect(WHAT_THE_FARM_IS_OWED.has("sale_broker")).toBe(true);
    expect(WHAT_THE_FARM_IS_OWED.has("selling_trip")).toBe(true);
    expect(HER_KEEP.has("sale_broker")).toBe(false);
  });

  it("counts her keep without what moved her", () => {
    expect([...HER_KEEP].toSorted()).toEqual(["dose", "feed", "herd", "vet"]);
  });
});

describe("what some charges came to", () => {
  it("adds each kind, both trips as one, and says what it is short by", () => {
    const costs = costsOf([
      ...hisCharges,
      charge("dose", "2030-01-12T02:00:00.000Z", 0, { priced: false }),
      charge("feed", "2030-01-12T02:00:00.000Z", 0, {
        unpricedKg: 40,
        priced: false,
      }),
    ]);
    expect(
      costsOf([charge("sale_broker", "2030-02-01T02:00:00.000Z", 1200)])
        .tripMoney
    ).toBe(1200);
    expect(costs).toEqual({
      feedMoney: 7000,
      unpricedKg: 40,
      medicineMoney: 0,
      uncostedDoses: 1,
      vetMoney: 1500,
      marketTollMoney: 500,
      tripMoney: 1900,
      herdMoney: 900,
    });
  });
});

describe("a Holding that ends in a loss", () => {
  // v1's bull, lost and made good by the Farm at ৳95,000; found, and so the Farm's; lost again as the Farm's own.
  const lostAgain = new Date("2030-04-01T05:00:00.000Z");
  const her: WhatHappened = {
    sale: null,
    internalSales: [],
    crossing: null,
    died: null,
    lost: lostAgain,
    madeGood: { ventureId: "v1", amountMoney: 95_000 },
  };

  it("gets back what was made good only where it is the Venture the Farm made good", () => {
    expect(
      howSheLeft(
        { animalId: "১০১", owner: "v1", side: "fattening", from: arrived },
        her,
        () => "v1"
      )
    ).toMatchObject({ how: "lost", backMoney: 95_000 });
    // The Farm's own Holding of her paid that money; lost, nothing came back to it.
    expect(
      howSheLeft(
        { animalId: "১০১", owner: null, side: "fattening", from: arrived },
        her,
        () => null
      )
    ).toMatchObject({ how: "lost", backMoney: 0 });
  });
});

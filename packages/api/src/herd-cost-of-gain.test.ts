import type { Charge } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import type { FarmCosts } from "./cost-store";
import { economicsOfHerd } from "./cost-store";

/**
 * A herd's Cost of Gain is what its animals were charged over the kilos they put on. A bull nobody has weighed since he
 * came put on kilos nobody knows: counting his feed against none of them read the herd's kilo at twice its price.
 * Figures worked by hand: ৳3,000 of feed each; the weighed bull 200 to 230 kg.
 */
const AT = new Date("2053-03-01T04:00:00.000Z");

const bull = (id: string, weighedKg: number | null) => ({
  id,
  tagNumber: id,
  side: "fattening",
  lactationStartedAt: null,
  intake: { weightKg: "200", purchasePriceMoney: 60_000 },
  sale: null,
  weighIns:
    weighedKg === null ? [] : [{ weightKg: String(weighedKg), weighedAt: AT }],
});

const fed = (animalId: string): Charge => ({
  kind: "feed",
  animalId,
  side: "fattening",
  at: AT,
  amount: 3000,
  fromId: "straw",
  unpricedKg: 0,
  priced: true,
});

// Only what the herd's sums read: the animals, and each one's charges.
const costs = {
  animals: [bull("weighed", 230), bull("never", null)],
  ofAnimal: {
    charges: new Map([
      ["weighed", [fed("weighed")]],
      ["never", [fed("never")]],
    ]),
    litres: new Map(),
  },
} as unknown as FarmCosts;

describe("a Venture herd's Cost of Gain", () => {
  it("is over the animals whose gain is known, while saying everything they were charged", () => {
    const herd = economicsOfHerd(costs, new Set(["weighed", "never"]));
    expect(herd.chargedMoney).toBe(6000);
    expect(herd.gainKg).toBe(30);
    expect(herd.costOfGainMoney).toBe(100);
  });
});

import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The farm's milk buyers, each as the last milk he took left him: his price, where he lives, his phone, and whether he
// paid at the gate or owed it. What the Dispatch sheet fills in once he is picked, so a collection centre that pays on
// its round is not booked as paid twice a day.

const suffix = `milk-buyers-${Date.now()}`;

const manager = (instant: string) =>
  createTestClient(appRouter, { as: "manager", clock: new FakeClock(instant) });

describe("the farm's milk buyers", () => {
  it("knows each by the last milk he took, the latest first", async () => {
    const atTheGate = await manager("2067-03-02T06:00:00.000Z");
    const sweetShop = `মিষ্টির দোকান ${suffix}`;
    const centre = `সংগ্রহ কেন্দ্র ${suffix}`;
    await atTheGate.client.milk.dispatch({
      dispatchedAt: new Date("2067-03-01T02:00:00.000Z"),
      liters: 9,
      buyer: { name: sweetShop },
      pricePerLiterMoney: 60,
    });
    await atTheGate.client.milk.dispatch({
      dispatchedAt: new Date("2067-03-01T12:00:00.000Z"),
      liters: 8,
      buyer: { name: sweetShop },
      pricePerLiterMoney: 62,
    });
    await atTheGate.client.milk.dispatch({
      dispatchedAt: new Date("2067-03-02T02:00:00.000Z"),
      liters: 40,
      buyer: { name: centre, address: "চৌরাস্তা", phone: "01711000000" },
      pricePerLiterMoney: 55,
      paidNowMoney: 0,
    });

    const everyBuyer = await atTheGate.client.milk.buyers();
    const buyers = everyBuyer.filter((one) => one.name.endsWith(suffix));

    expect(buyers).toEqual([
      {
        name: centre,
        address: "চৌরাস্তা",
        phone: "01711000000",
        pricePerLiterMoney: 55,
        paysLater: true,
      },
      {
        name: sweetShop,
        address: null,
        phone: null,
        pricePerLiterMoney: 62,
        paysLater: false,
      },
    ]);
  });

  it("is one buyer however his name's letters were capitalized", async () => {
    const atTheGate = await manager("2067-04-02T06:00:00.000Z");
    await atTheGate.client.milk.dispatch({
      dispatchedAt: new Date("2067-04-01T02:00:00.000Z"),
      liters: 20,
      buyer: { name: `Milk Point ${suffix}` },
      pricePerLiterMoney: 58,
    });
    await atTheGate.client.milk.dispatch({
      dispatchedAt: new Date("2067-04-02T02:00:00.000Z"),
      liters: 21,
      buyer: { name: `milk point ${suffix}` },
      pricePerLiterMoney: 59,
    });

    const everyBuyer = await atTheGate.client.milk.buyers();
    const buyers = everyBuyer.filter((one) =>
      one.name.toLowerCase().startsWith("milk point")
    );

    expect(buyers).toMatchObject([
      { name: `Milk Point ${suffix}`, pricePerLiterMoney: 59 },
    ]);
  });

  it("is read only by whoever records the milk leaving", async () => {
    const staff = await createTestClient(appRouter, {
      as: "staff",
      clock: new FakeClock("2067-04-02T06:00:00.000Z"),
    });
    await expect(staff.client.milk.buyers()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

import { uuidv7 } from "@OpenFarm/db/ids";
import { counterparty } from "@OpenFarm/db/schema/fattening";
import { dispatch } from "@OpenFarm/db/schema/milk";
import { sameName } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { knownAs } from "../counterparty-store";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The farm's milk buyers, each as his recent milk left him: his price, where he lives, his phone, and whether he takes
// it on credit. What the Dispatch sheet fills in once he is picked, so a collection center that pays on its round is not
// booked as paid twice a day.

const suffix = `milk-buyers-${Date.now()}`;

const manager = (instant: string) =>
  createTestClient(appRouter, { as: "manager", clock: new FakeClock(instant) });

/** The farm's milk buyers whose names end with this file's mark. */
const oursOf = async (
  client: Awaited<ReturnType<typeof manager>>["client"]
) => {
  const everyBuyer = await client.milk.buyers();
  return everyBuyer.filter((one) => one.name.endsWith(suffix));
};

describe("the farm's milk buyers", () => {
  it("knows each by his recent milk, the latest first", async () => {
    const atTheGate = await manager("2067-03-02T06:00:00.000Z");
    const sweetShop = `মিষ্টির দোকান ${suffix}`;
    const center = `সংগ্রহ কেন্দ্র ${suffix}`;
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
      buyer: { name: center, address: "চৌরাস্তা", phone: "01711000000" },
      pricePerLiterMoney: 55,
      paidNowMoney: 0,
    });

    expect(await oursOf(atTheGate.client)).toEqual([
      {
        name: center,
        address: "চৌরাস্তা",
        phone: "01711000000",
        pricePerLiterMoney: 55,
        paysLater: true,
        priceToFollow: false,
        counterpartyId: expect.any(String),
      },
      {
        name: sweetShop,
        address: null,
        phone: null,
        pricePerLiterMoney: 62,
        paysLater: false,
        priceToFollow: false,
        counterpartyId: expect.any(String),
      },
    ]);
  });

  it("takes it on credit when most of his recent milk went all on credit, and a part paid at the gate is paid", async () => {
    const atTheGate = await manager("2067-05-10T06:00:00.000Z");
    const usuallyCredit = `ক্রেডিট কেন্দ্র ${suffix}`;
    const paysSome = `কিছু দেন ${suffix}`;
    // On credit, on credit, then paid: most of it on credit, though his very last milk was paid for at the gate.
    for (const [day, paidNowMoney] of [
      ["2067-05-01", 0],
      ["2067-05-02", 0],
      ["2067-05-03", undefined],
    ] as const) {
      // One after another, as the farm hands it over.
      // oxlint-disable-next-line no-await-in-loop
      await atTheGate.client.milk.dispatch({
        dispatchedAt: new Date(`${day}T02:00:00.000Z`),
        liters: 10,
        buyer: { name: usuallyCredit },
        pricePerLiterMoney: 50,
        paidNowMoney,
      });
    }
    // All on credit once, then something paid at the gate twice: he pays at the gate.
    for (const [day, paidNowMoney] of [
      ["2067-05-04", 0],
      ["2067-05-05", 200],
      ["2067-05-06", 100],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      await atTheGate.client.milk.dispatch({
        dispatchedAt: new Date(`${day}T02:00:00.000Z`),
        liters: 10,
        buyer: { name: paysSome },
        pricePerLiterMoney: 50,
        paidNowMoney,
      });
    }

    const buyers = await oursOf(atTheGate.client);

    expect(buyers.find((one) => one.name === usuallyCredit)?.paysLater).toBe(
      true
    );
    expect(buyers.find((one) => one.name === paysSome)?.paysLater).toBe(false);
  });

  it("is one buyer however his name's letters were capitalized or spaced", async () => {
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
      buyer: { name: `milk   point ${suffix}` },
      pricePerLiterMoney: 59,
    });

    expect(await oursOf(atTheGate.client)).toContainEqual(
      expect.objectContaining({
        name: `Milk Point ${suffix}`,
        pricePerLiterMoney: 59,
      })
    );
    const buyers = await oursOf(atTheGate.client);
    expect(
      buyers.filter((one) => sameName(one.name, `milk point ${suffix}`))
    ).toHaveLength(1);
  });

  it("names the Counterparty the milk is booked to where two kept on the farm differ only in their capitals", async () => {
    const atTheGate = await manager("2067-06-02T06:00:00.000Z");
    const farmId = theFarm().id;
    const first = uuidv7(new Date("2067-01-01T00:00:00.000Z"));
    const second = uuidv7(new Date("2067-02-01T00:00:00.000Z"));
    // Two written down before the farm compared names without their capitals, the first with a phone.
    await scratchDb()
      .insert(counterparty)
      .values([
        {
          id: first,
          farmId,
          name: `Twin Dairy ${suffix}`,
          phone: "01811111111",
          createdAt: new Date("2067-01-01T00:00:00.000Z"),
        },
        {
          id: second,
          farmId,
          name: `TWIN DAIRY ${suffix}`,
          phone: "01922222222",
          createdAt: new Date("2067-02-01T00:00:00.000Z"),
        },
      ]);
    // An old Dispatch on the second.
    await scratchDb()
      .insert(dispatch)
      .values({
        id: uuidv7(new Date("2067-06-01T02:00:00.000Z")),
        farmId,
        dispatchedAt: new Date("2067-06-01T02:00:00.000Z"),
        liters: "12.00",
        buyerId: second,
        buyerName: `TWIN DAIRY ${suffix}`,
        pricePerLiterMoney: "57.00",
        recordedByRole: "manager",
        recordedAt: new Date("2067-06-01T02:00:00.000Z"),
      });

    const buyers = await oursOf(atTheGate.client);
    const twins = buyers.filter((one) =>
      sameName(one.name, `twin dairy ${suffix}`)
    );

    expect(twins).toEqual([
      expect.objectContaining({
        name: `Twin Dairy ${suffix}`,
        phone: "01811111111",
        pricePerLiterMoney: 57,
      }),
    ]);
  });

  it("finds a name the farm keeps exactly as the sheet compares it", async () => {
    await manager("2067-06-02T06:00:00.000Z");
    const farmId = theFarm().id;
    const kept = `Rahim  Dairy ${suffix}`;
    await scratchDb()
      .insert(counterparty)
      .values({
        id: uuidv7(new Date("2067-06-02T00:00:00.000Z")),
        farmId,
        name: kept,
        createdAt: new Date("2067-06-02T00:00:00.000Z"),
      });
    for (const said of [
      `rahim dairy ${suffix}`,
      ` RAHIM   DAIRY ${suffix} `,
      `Rahim Dairies ${suffix}`,
    ]) {
      // oxlint-disable-next-line no-await-in-loop
      const found = await knownAs(scratchDb(), farmId, said);
      expect(found !== undefined, said).toBe(sameName(said, kept));
    }
  });

  it("leaves out a buyer who has taken no milk for half a year", async () => {
    const atTheGate = await manager("2067-12-31T06:00:00.000Z");
    const longGone = `পুরনো ক্রেতা ${suffix}`;
    await atTheGate.client.milk.dispatch({
      dispatchedAt: new Date("2067-06-01T02:00:00.000Z"),
      liters: 5,
      buyer: { name: longGone },
      pricePerLiterMoney: 50,
    });

    const buyers = await oursOf(atTheGate.client);

    expect(buyers.map((one) => one.name)).not.toContain(longGone);
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

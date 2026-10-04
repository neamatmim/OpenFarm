import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { workedOutAfresh } from "../writes-seen";
import { appRouter } from "./index";

/**
 * The farm's costing and its feed store are worked out from the whole history, and the Owner's overview asks for each
 * more than once at a time; the store is read again on every opening of the staff's page. Each is kept until something
 * is written, so asking again costs nothing — and anything written is in the next answer.
 */
const suffix = `kept-costing-${Date.now()}`;
const AT = "2089-04-01T05:00:00.000Z";

const as = (role: "owner" | "manager" | "vet") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(AT) });

describe("the farm's costing", () => {
  it("is worked out once while nothing is written, and again once something is", async () => {
    const owner = await as("owner");
    const shed = await owner.client.sheds.create({ name: suffix });
    const pen = await owner.client.sheds.pens.create({
      shedId: shed.id,
      name: `গাভী ${suffix}`,
    });
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    const { tagNumber } = cow;

    const first = await owner.client.costs.forAnimal({ tagNumber });
    expect(first.vetMoney).toBe(0);
    const worked = workedOutAfresh("costs");
    await owner.client.costs.forAnimal({ tagNumber });
    await owner.client.costs.forAnimal({ tagNumber });
    expect(workedOutAfresh("costs")).toBe(worked);

    // The Vet's visit to her is written: the next answer carries it.
    const vet = await as("vet");
    await vet.client.money.vetFee({
      amountMoney: 500,
      visitedOn: "2089-04-01",
      animalTags: [tagNumber],
    });
    const after = await owner.client.costs.forAnimal({ tagNumber });
    expect(after.vetMoney).toBe(500);
    expect(workedOutAfresh("costs")).toBe(worked + 1);
  });

  it("keeps the feed store until a delivery is written, and has the delivery in the next answer", async () => {
    const manager = await as("manager");
    const bran = await manager.client.feed.items.create({
      name: { bn: `ভুসি ${suffix}` },
    });
    const deliver = (quantity: number) =>
      manager.client.stock.receive({
        feedItemId: bran.id,
        kind: "purchase",
        quantity,
        priceMoney: quantity * 30,
        seller: { name: `রহমান ফিডস ${suffix}` },
        receivedOn: "2089-04-01",
      });
    const onHandOfBran = async () => {
      const lines = await manager.client.stock.onHand();
      return lines.find((line) => line.feedItemId === bran.id)?.onHand;
    };
    await deliver(100);
    await expect(onHandOfBran()).resolves.toBe(100);
    const worked = workedOutAfresh("feedStore");
    await onHandOfBran();
    await onHandOfBran();
    expect(workedOutAfresh("feedStore")).toBe(worked);

    await deliver(50);
    await expect(onHandOfBran()).resolves.toBe(150);
    expect(workedOutAfresh("feedStore")).toBe(worked + 1);
  });
});

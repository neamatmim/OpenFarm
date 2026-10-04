import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { costingsWorkedOut } from "../cost-store";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The farm's costing is worked out from its whole history, and the Owner's overview asks for it four times at once. It
 * is kept until something is written, so asking again costs nothing — and anything written is in the next answer.
 */
const suffix = `kept-costing-${Date.now()}`;
const AT = "2089-04-01T05:00:00.000Z";

const as = (role: "owner" | "vet") =>
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
    const worked = costingsWorkedOut();
    await owner.client.costs.forAnimal({ tagNumber });
    await owner.client.costs.forAnimal({ tagNumber });
    expect(costingsWorkedOut()).toBe(worked);

    // The Vet's visit to her is written: the next answer carries it.
    const vet = await as("vet");
    await vet.client.money.vetFee({
      amountMoney: 500,
      visitedOn: "2089-04-01",
      animalTags: [tagNumber],
    });
    const after = await owner.client.costs.forAnimal({ tagNumber });
    expect(after.vetMoney).toBe(500);
    expect(costingsWorkedOut()).toBe(worked + 1);
  });
});

import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A cow already in milk when the farm's books began — the opening register's — has calved before: her keep since is
// the milk's cost, never capital (ADR 0023). On the opening register on 1 March 2047, she and a heifer share ৳2,000 of
// spray on the 5th: the heifer's ৳1,000 is capital, the cow's is not.

const as = (role: "owner", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** Midnight on 1 March on the farm's own clock. */
const FIRST_OF_MARCH = "2047-02-28T18:00:00.000Z";

beforeAll(async () => {
  const { client: owner } = await as("owner", FIRST_OF_MARCH);
  const spray = await owner.money.categories.create({
    nameBn: "স্প্রে",
    direction: "out",
  });
  await owner.money.categories.setChargedToAnimals({
    categoryId: spray.id,
    chargedToAnimals: true,
  });
  const shed = await owner.sheds.create({ name: "গাভী শেড" });
  const pen = await owner.sheds.pens.create({ shedId: shed.id, name: "গাভী" });
  await owner.animals.importRegister({
    csv: [
      "sex,side,state,pen,source",
      `female,dairy,milking,${pen.name},bought`,
      `female,dairy,heifer,${pen.name},bought`,
    ].join("\n"),
  });
  const { client: spending } = await as("owner", "2047-03-05T04:00:00.000Z");
  await spending.money.enter({
    categoryId: spray.id,
    amountMoney: 2000,
    occurredOn: "2047-03-05",
    counterparty: { name: "দোকান" },
    paymentMethod: "cash",
    side: "dairy",
  });
});

describe("a cow in milk before the books began", () => {
  it("adds none of her keep to the dairy herd's capital", async () => {
    const { client: owner } = await as("owner", "2047-04-10T04:00:00.000Z");
    const { figures } = await owner.monthlyReport.month({ month: "2047-03" });

    expect(figures.atEnd.capital.dairyMoney).toBe(1000);
  });
});

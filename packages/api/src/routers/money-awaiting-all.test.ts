import { uuidv7 } from "@OpenFarm/db/ids";
import { moneyEvent } from "@OpenFarm/db/schema/money";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Money waiting for the Owner's word, counted and totalled on the farm: her home lists the oldest fifty, and a count
 * or a total made from those fifty would say less than is waiting.
 */
const suffix = `awaiting-all-${Date.now()}`;
const AT = "2093-05-10T04:00:00.000Z";
const WAITING = 51;
const EACH_MONEY = 2_000_000;

const as = (role: "owner" | "manager") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(AT) });

beforeAll(async () => {
  const owner = await as("owner");
  const category = await owner.client.money.categories.create({
    direction: "out",
    nameBn: `যন্ত্র ${suffix}`,
  });
  // Over any line the farm draws: it waits for the Owner.
  const manager = await as("manager");
  await manager.client.money.enter({
    categoryId: category.id,
    amountMoney: EACH_MONEY,
    occurredOn: "2093-05-09",
    counterparty: { name: `দোকান ${suffix}` },
    paymentMethod: "cash",
    side: "dairy",
    note: suffix,
  });
  const first = await scratchDb().query.moneyEvent.findFirst({
    where: { farmId: theFarm().id, note: suffix },
  });
  if (first?.approval !== "awaiting") {
    throw new Error("expected the entry to wait for the Owner");
  }
  await scratchDb()
    .insert(moneyEvent)
    .values(
      Array.from({ length: WAITING - 1 }, (_, index) => ({
        ...first,
        id: uuidv7(),
        sourceId: `${suffix}-${index}`,
      }))
    );
});

describe("money waiting for the Owner", () => {
  it("lists the oldest fifty, and counts and totals all of it", async () => {
    const owner = await as("owner");
    const { needsYou } = await owner.client.overview.get();
    expect(needsYou.moneyAwaiting).toHaveLength(50);
    expect(needsYou.moneyAwaitingAll).toMatchObject({
      count: WAITING,
      totalMoney: WAITING * EACH_MONEY,
    });
  });
});

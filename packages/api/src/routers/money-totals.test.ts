import { uuidv7 } from "@OpenFarm/db/ids";
import { moneyEvent } from "@OpenFarm/db/schema/money";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A month's money told as totals worked out on the farm, not added up on a phone from the rows it was sent: the list
 * stops at five hundred rows, and a busy month's totals from five hundred of them would quietly be short.
 */
const suffix = `money-totals-${Date.now()}`;
const AT = "2076-03-10T04:00:00.000Z";
const MARCH = { from: "2076-03-01", to: "2076-03-31" };

/** More than the list shows. */
const ENTRIES = 501;
const EACH_MONEY = 100;

const as = (role: "owner" | "manager") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(AT) });

beforeAll(async () => {
  const owner = await as("owner");
  const category = await owner.client.money.createCategory({
    direction: "out",
    nameBn: `ঔষধ স্প্রে ${suffix}`,
  });
  const manager = await as("manager");
  await manager.client.money.enter({
    categoryId: category.id,
    amountMoney: EACH_MONEY,
    occurredOn: "2076-03-05",
    counterparty: { name: `দোকান ${suffix}` },
    paymentMethod: "cash",
    side: "fattening",
    note: suffix,
  });
  // The rest written straight in, as many entries as a busy month: the question is the totals, not the entering.
  const first = await scratchDb().query.moneyEvent.findFirst({
    where: { farmId: theFarm().id, note: suffix },
  });
  if (!first) {
    throw new Error("expected the first entry");
  }
  await scratchDb()
    .insert(moneyEvent)
    .values(
      Array.from({ length: ENTRIES - 1 }, (_, index) => ({
        ...first,
        id: uuidv7(),
        sourceId: `${suffix}-${index}`,
      }))
    );
});

describe("a month's money", () => {
  it("shows five hundred rows of it, and says there is more", async () => {
    const manager = await as("manager");
    const list = await manager.client.money.list(MARCH);
    expect(list.events).toHaveLength(500);
    expect(list.more).toBe(true);
  });

  it("tells its totals from every entry in it, not from the rows shown", async () => {
    const manager = await as("manager");
    const list = await manager.client.money.list(MARCH);
    expect(list.totals).toEqual({
      inMoney: 0,
      outMoney: ENTRIES * EACH_MONEY,
      awaiting: 0,
    });
  });
});

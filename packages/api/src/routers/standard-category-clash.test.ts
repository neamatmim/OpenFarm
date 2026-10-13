import { uuidv7 } from "@OpenFarm/db/ids";
import { moneyCategory } from "@OpenFarm/db/schema/money";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A farm that kept its loans under a Category of its own before the standard one came (ADR 0027): its «ঋণ পাওয়া» is
// taken up as the standard Loan received, so the money already under it is outside the results too, and the standard
// one is not lost for want of a name. One marked as charged to the animals is a cost in the farm's own use, and is
// left as the farm's.

const as = () =>
  createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock("2048-05-01T04:00:00.000Z"),
  });

const ownLoans = uuidv7(new Date("2048-04-01T04:00:00.000Z"));
const ownMachines = uuidv7(new Date("2048-04-01T04:00:01.000Z"));

beforeAll(async () => {
  await as();
  await scratchDb()
    .insert(moneyCategory)
    .values([
      {
        id: ownLoans,
        farmId: theFarm().id,
        key: null,
        nameBn: "ঋণ পাওয়া",
        nameEn: null,
        direction: "in",
        createdAt: new Date("2048-04-01T04:00:00.000Z"),
      },
      {
        id: ownMachines,
        farmId: theFarm().id,
        key: null,
        nameBn: "Machine or building bought",
        nameEn: null,
        direction: "out",
        chargedToAnimals: true,
        createdAt: new Date("2048-04-01T04:00:00.000Z"),
      },
    ]);
});

describe("a standard Category whose name the farm already uses", () => {
  it("takes up the farm's own as the standard one", async () => {
    const { client } = await as();
    const categories = await client.money.categories.list();
    const loans = categories.find((one) => one.key === "loan_received");

    expect(loans?.id).toBe(ownLoans);
    expect(loans?.outsideTheResults).toBe(true);
  });

  it("leaves one the farm uses another way as the farm's", async () => {
    const { client } = await as();
    const categories = await client.money.categories.list();

    expect(categories.find((one) => one.id === ownMachines)?.key).toBeNull();
  });
});

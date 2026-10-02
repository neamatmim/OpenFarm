import { ventureMovement } from "@OpenFarm/db/schema/venture";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Settlement that would leave a taka or more in the Venture Account once everybody is paid — or be a taka or more
 * short of paying them — is not rounding. It waits, and says by how much, until the Owner has found it.
 */
const suffix = `adds-up-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let ventureId = "";
let sprayId = "";

const balanceOf = async (instant: string) => {
  const owner = await as("owner", instant);
  const ventures = await owner.client.ventures.list();
  return ventures.find((one) => one.id === ventureId)?.balanceBdt ?? 0;
};

/** A Herd Cost for the Fattening side, entered by the Manager on one day for another. */
const sprayed = async (
  instant: string,
  occurredOn: string,
  amountBdt: number
) => {
  const manager = await as("manager", instant);
  await manager.client.money.enter({
    categoryId: sprayId,
    amountBdt,
    occurredOn,
    counterparty: { name: `দোকান ${suffix}` },
    paymentMethod: "cash",
    side: "fattening",
    note: `${occurredOn} ${suffix}`,
  });
};

beforeAll(async () => {
  const owner = await as("owner", "2075-01-02T04:00:00.000Z");
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2075-01-02",
    targetWindowStart: "2075-06-01",
    targetWindowEnd: "2075-06-05",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  ventureId = venture.id;
  await putCapitalIn(
    owner.client,
    { id: ventureId, units: 20, unitPriceBdt: 50_000 },
    suffix,
    "2075-01-02"
  );
  await owner.client.ventures.startBuying({ id: ventureId });
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  const spray = await owner.client.money.addCategory({
    nameBn: `মাছি স্প্রে ${suffix}`,
    direction: "out",
  });
  sprayId = spray.id;
  await owner.client.money.setChargedToAnimals({
    categoryId: sprayId,
    chargedToAnimals: true,
  });

  // The Venture's one bull, bought at the gate on the fifth of January.
  const buyer = await as("owner", "2075-01-05T06:00:00.000Z");
  const bull = await buyer.client.intake.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `প্রতিবেশী ${suffix}` },
    purchasePriceBdt: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2075-01-05T05:00:00.000Z"),
    ventureId,
    ...PAID_FROM_THE_ACCOUNT,
  });

  // January's fly spray, the whole of it his share: he is the only animal on the side.
  await sprayed("2075-01-20T06:00:00.000Z", "2075-01-20", 3000);

  // January read against the statement, then repaid to the Farm.
  const reading = await as("owner", "2075-02-01T04:00:00.000Z");
  await reading.client.ventures.checkTheBank({
    ventureId,
    month: "2075-01",
    readBdt: await balanceOf("2075-02-01T04:00:00.000Z"),
  });
  const paying = await as("owner", "2075-02-02T04:00:00.000Z");
  const january = await paying.client.ventures.consumption({
    ventureId,
    month: "2075-01",
  });
  await paying.client.ventures.reimburse({
    ventureId,
    month: "2075-01",
    movedOn: "2075-02-02",
    paymentMethod: "bank",
    reference: `REI-${suffix}`,
    amountBdt: january.totalBdt,
  });

  // A second bill for January's spray turns up after January was repaid.
  await sprayed("2075-02-03T06:00:00.000Z", "2075-01-25", 2000);

  // He dies in February, so nothing of the Venture's still stands.
  const manager = await as("manager", "2075-02-05T06:00:00.000Z");
  await manager.client.animals.recordMortality({
    tagNumber: bull.tagNumber,
    kind: "died",
    cause: `সাপে কেটেছে ${suffix}`,
    disposal: "buried",
  });

  // February read against the statement.
  const march = await as("owner", "2075-03-01T04:00:00.000Z");
  await march.client.ventures.checkTheBank({
    ventureId,
    month: "2075-02",
    readBdt: await balanceOf("2075-03-01T04:00:00.000Z"),
  });
});

describe("a Settlement whose account does not add up", () => {
  it("owes a cost it never paid the Farm, as what the next Reimbursement is to carry", async () => {
    const owner = await as("owner", "2075-03-02T04:00:00.000Z");
    const settlement = await owner.client.ventures.settlement({ ventureId });
    // The late two thousand is charged to the Investors and still sits in their account: it is the Farm's, owed,
    // and so not money nobody can explain.
    expect(settlement.blocks).toContainEqual({
      word: "a_reimbursement_is_owed",
      months: [],
      carryBdt: 2000,
    });
    expect(settlement.blocks.map((one) => one.word)).not.toContain(
      "the_account_does_not_add_up"
    );
  });

  it("waits, and says by how much, while the account is short of what nothing explains", async () => {
    // A payment out of the account that no record of the farm's accounts for — what a defect, or a hand in the
    // database, would leave behind.
    await scratchDb()
      .insert(ventureMovement)
      .values({
        id: `stray-${suffix}`,
        farmId: theFarm().id,
        ventureId,
        kind: "farm_share",
        amountBdt: 1500,
        movedOn: "2075-02-20",
        reference: `অজানা ${suffix}`,
        createdAt: new Date("2075-02-20T04:00:00.000Z"),
      });
    const owner = await as("owner", "2075-03-02T04:00:00.000Z");
    const settlement = await owner.client.ventures.settlement({ ventureId });
    expect(settlement.blocks).toContainEqual({
      word: "the_account_does_not_add_up",
      overBdt: -1500,
    });
    await expect(
      owner.client.ventures.approveSettlement({ ventureId })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

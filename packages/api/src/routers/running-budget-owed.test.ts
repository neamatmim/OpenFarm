import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The Farm pays for a Venture's animals all month and is repaid after it, so what its account holds is always that
 * much richer than what is really left to keep them with. The warning that the Running Budget is low reads what is
 * left after what its animals have cost the Farm since the last Reimbursement — so it fires when the money runs short,
 * not a month after.
 */
const suffix = `owed-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let ventureId = "";
let sprayId = "";

/** How the Owner's list and the Manager's read the Venture on one instant. */
const readBoth = async (instant: string) => {
  const owner = await as("owner", instant);
  const manager = await as("manager", instant);
  const all = await owner.client.ventures.list();
  const atWork = await manager.client.ventures.running();
  const listed = all.find((one) => one.id === ventureId);
  const running = atWork.find((one) => one.id === ventureId);
  return { listed, running };
};

beforeAll(async () => {
  const owner = await as("owner", "2079-01-01T04:00:00.000Z");
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2079-01-01",
    targetWindowStart: "2079-09-01",
    targetWindowEnd: "2079-09-05",
    unitPriceMoney: 50_000,
    units: 20,
    // Two lakh to keep the animals with.
    cattleBudgetMoney: 800_000,
  });
  ventureId = venture.id;
  await putCapitalIn(
    owner.client,
    { id: ventureId, units: 20, unitPriceMoney: 50_000 },
    suffix,
    "2079-01-01"
  );
  await owner.client.ventures.startBuying({ id: ventureId });
  // The Owner's line, just under the two lakh.
  await owner.client.farm.setParameters({ runningBudgetWarnMoney: 199_000 });
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  const spray = await owner.client.money.categories.create({
    nameBn: `মাছি স্প্রে ${suffix}`,
    direction: "out",
  });
  sprayId = spray.id;
  await owner.client.money.categories.setChargedToAnimals({
    categoryId: sprayId,
    chargedToAnimals: true,
  });
  const buyer = await as("owner", "2079-01-02T06:00:00.000Z");
  await buyer.client.intakes.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `প্রতিবেশী ${suffix}` },
    purchasePriceMoney: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2079-01-02T05:00:00.000Z"),
    ventureId,
    ...PAID_FROM_THE_ACCOUNT,
  });
});

describe("the Running Budget warning", () => {
  it("counts what the Farm has paid for its animals this month and not been repaid", async () => {
    const before = await readBoth("2079-01-05T04:00:00.000Z");
    expect(before.listed).toMatchObject({
      runningBudgetHeldMoney: 200_000,
      owedTheFarmMoney: 0,
      runningBudgetLow: false,
    });
    // Three thousand of fly spray, the Farm's money, for the Venture's one bull.
    const owner = await as("owner", "2079-01-10T06:00:00.000Z");
    await owner.client.money.enter({
      categoryId: sprayId,
      amountMoney: 3000,
      occurredOn: "2079-01-10",
      counterparty: { name: `দোকান ${suffix}` },
      paymentMethod: "cash",
      side: "fattening",
      note: suffix,
    });
    const after = await readBoth("2079-01-20T04:00:00.000Z");
    // The account still holds two lakh; what is really left is a hundred and ninety-seven thousand, under the line.
    expect(after.listed).toMatchObject({
      runningBudgetHeldMoney: 200_000,
      owedTheFarmMoney: 3000,
      runningBudgetLow: true,
    });
    // The Manager's reading of the same Venture says the same.
    expect(after.running).toMatchObject({
      owedTheFarmMoney: after.listed?.owedTheFarmMoney,
      runningBudgetLow: after.listed?.runningBudgetLow,
    });
  });

  it("reads the same once the month is repaid", async () => {
    const owner = await as("owner", "2079-02-02T04:00:00.000Z");
    const january = await owner.client.ventures.consumption({
      ventureId,
      month: "2079-01",
    });
    await owner.client.ventures.reimburse({
      ventureId,
      month: "2079-01",
      movedOn: "2079-02-02",
      paymentMethod: "bank",
      reference: `REI-${suffix}`,
      amountMoney: january.totalMoney,
    });
    const repaid = await readBoth("2079-02-03T04:00:00.000Z");
    // The money has left the account and nothing is owed: what is left is what it was.
    expect(repaid.listed).toMatchObject({
      runningBudgetHeldMoney: 197_000,
      owedTheFarmMoney: 0,
      runningBudgetLow: true,
    });
    expect(repaid.running).toMatchObject({
      owedTheFarmMoney: 0,
      runningBudgetLow: true,
    });
  });
});

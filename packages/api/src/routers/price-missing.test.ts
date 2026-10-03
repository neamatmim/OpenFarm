import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A month whose feed nothing can price is not reimbursed until it is priced: the Farm would otherwise be repaid
 * nothing for it, and the Settlement — which refuses an unpriced kilo — would then have the Owner price it into a
 * month already paid.
 */
const suffix = `unpriced-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const feedSop = (): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix}`, en: "Feeding" },
  purpose: { bn: "পেন অনুযায়ী খাবার দেওয়া" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "feed",
      text: { bn: "পেনে খাবার দিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "feeding" },
    },
  ],
});

let ventureId = "";
let penId = "";
let grassId = "";
let definitionId = "";

/** One morning's round in the pen: this much of the grass, and of anything else given beside it. */
const fedOn = async (
  day: string,
  givenKg: number,
  beside: { feedItemId: string; givenKg: number }[] = []
) => {
  const scheduler = await as("owner", `${day}T00:30:00.000Z`);
  await scheduler.client.work.ensureDue();
  const due = await scheduler.client.work.today({ penId });
  const round = due.find((one) => one.definitionId === definitionId);
  const staff = await as("staff", `${day}T00:30:00.000Z`);
  await staff.client.work.claim({ id: round?.id ?? "" });
  await staff.client.work.completeStep({
    instanceId: round?.id ?? "",
    stepId: "feed",
    evidence: [true],
    feeding: [{ feedItemId: grassId, givenKg }, ...beside],
  });
};

const reimburse = async (
  instant: string,
  month: string,
  amountMoney: number
) => {
  const owner = await as("owner", instant);
  return await owner.client.ventures.reimburse({
    ventureId,
    month,
    movedOn: instant.slice(0, 10),
    paymentMethod: "bank",
    reference: `REI-${month}-${suffix}`,
    amountMoney,
  });
};

beforeAll(async () => {
  const owner = await as("owner", "2077-01-01T04:00:00.000Z");
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2077-01-01",
    targetWindowStart: "2077-09-01",
    targetWindowEnd: "2077-09-05",
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  ventureId = venture.id;
  await putCapitalIn(
    owner.client,
    { id: ventureId, units: 20, unitPriceMoney: 50_000 },
    suffix,
    "2077-01-01"
  );
  await owner.client.ventures.startBuying({ id: ventureId });
  const shed = await owner.client.sheds.createShed({ name: suffix });
  const pen = await owner.client.sheds.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  await as("staff", "2077-01-01T04:00:00.000Z");
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-${suffix}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId,
    })
    .onConflictDoNothing();

  // Grass cut on the farm's own land, which nobody has put a price on.
  const manager = await as("manager", "2077-01-01T05:00:00.000Z");
  const grass = await manager.client.feed.addItem({
    name: { bn: `ঘাস ${suffix}` },
  });
  grassId = grass.id;
  await manager.client.stock.receive({
    feedItemId: grassId,
    kind: "harvest",
    quantity: 2000,
    receivedOn: "2077-01-01",
  });
  const ration = await manager.client.feed.saveRation({
    name: { bn: `রেশন ${suffix}` },
    items: [{ feedItemId: grassId, kgPerAnimalPerDay: 20 }],
  });
  await manager.client.feed.assignRation({
    penId,
    rationId: ration.rationId,
  });
  ({ definitionId } = await owner.client.sops.create({ content: feedSop() }));

  // The Venture's one bull at the gate, fed the grass in January.
  const buyer = await as("owner", "2077-01-02T06:00:00.000Z");
  await buyer.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `প্রতিবেশী ${suffix}` },
    purchasePriceMoney: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2077-01-02T05:00:00.000Z"),
    ventureId,
    ...PAID_FROM_THE_ACCOUNT,
  });
  await fedOn("2077-01-10", 20);
});

describe("a month with a price missing", () => {
  it("is not reimbursed, and says how many kilos nothing can price", async () => {
    const owner = await as("owner", "2077-02-02T04:00:00.000Z");
    const january = await owner.client.ventures.consumption({
      ventureId,
      month: "2077-01",
    });
    expect(january).toMatchObject({ unpricedKg: 20, uncostedDoses: 0 });
    await expect(
      reimburse("2077-02-02T04:00:00.000Z", "2077-01", january.totalMoney)
    ).rejects.toMatchObject({
      data: { refusal: "a_price_is_missing", unpricedKg: 20 },
    });
  });

  it("goes through at the priced figure once the grass is priced", async () => {
    // The Owner prices it, as the Settlement would have her do: a purchase of the same grass, back-dated before it
    // was eaten, gives the kilos a price.
    const manager = await as("manager", "2077-02-03T05:00:00.000Z");
    await manager.client.stock.receive({
      feedItemId: grassId,
      kind: "purchase",
      quantity: 100,
      priceMoney: 500,
      seller: { name: `ঘাসওয়ালা ${suffix}` },
      receivedOn: "2077-01-01",
    });
    const owner = await as("owner", "2077-02-04T04:00:00.000Z");
    const january = await owner.client.ventures.consumption({
      ventureId,
      month: "2077-01",
    });
    expect(january.unpricedKg).toBe(0);
    expect(january.totalMoney).toBeGreaterThan(0);
    const taken = await reimburse(
      "2077-02-04T04:00:00.000Z",
      "2077-01",
      january.totalMoney
    );
    expect(taken.totalMoney).toBe(january.totalMoney);
  });

  it("waits for the one feed nothing can price, though the rest of the month has a price", async () => {
    // Straw cut on the farm and never priced, fed beside the grass, which now has one.
    const manager = await as("manager", "2077-02-05T05:00:00.000Z");
    const straw = await manager.client.feed.addItem({
      name: { bn: `খড় ${suffix}` },
    });
    await manager.client.stock.receive({
      feedItemId: straw.id,
      kind: "harvest",
      quantity: 500,
      receivedOn: "2077-02-05",
    });
    // On the Pen's Ration beside the grass, as anything fed there is.
    const ration = await manager.client.feed.saveRation({
      name: { bn: `ঘাস আর খড় ${suffix}` },
      items: [
        { feedItemId: grassId, kgPerAnimalPerDay: 20 },
        { feedItemId: straw.id, kgPerAnimalPerDay: 5 },
      ],
    });
    await manager.client.feed.assignRation({
      penId,
      rationId: ration.rationId,
    });
    await fedOn("2077-02-10", 10, [{ feedItemId: straw.id, givenKg: 5 }]);
    const owner = await as("owner", "2077-03-02T04:00:00.000Z");
    const february = await owner.client.ventures.consumption({
      ventureId,
      month: "2077-02",
    });
    // The grass has a figure; the straw has none, and repaying the month now would leave it out for good.
    expect(february.totalMoney).toBeGreaterThan(0);
    expect(february).toMatchObject({ unpricedKg: 5 });
    await expect(
      reimburse("2077-03-02T04:00:00.000Z", "2077-02", february.totalMoney)
    ).rejects.toMatchObject({
      data: { refusal: "a_price_is_missing", unpricedKg: 5 },
    });
  });
});

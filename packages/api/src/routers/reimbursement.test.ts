import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The monthly Reimbursement: the Farm buys feed for the whole herd, and once a month what a Venture's
 * Animals ate of it moves from the Venture Account to the Farm's — itemised enough to read to an
 * Investor.
 */
const suffix = `reimb-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const MONTH = "2047-03";

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

let penId = "";
let ventureId = "";
let itemId = "";
let definitionId = "";
let twoItemsVentureId = "";
let sharedPenId = "";

/**
 * A second Pen, fed a mix of two Feed Items, with two animals in it — one this Venture's and one the
 * Farm's. What a month cost has to come apart by item and by animal, and a single-animal single-item
 * case could never show that it does.
 */
const aMixedPen = async () => {
  const owner = await as("owner", "2047-03-06T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: `mixed-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `মিশ্র ${suffix}`,
  });
  sharedPenId = pen.id;
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa2-${suffix}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();

  const venture = await owner.client.ventures.open({
    name: `দ্বিতীয় ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 500_000,
    floorBdt: 0,
    decideBy: "2047-03-20",
    targetWindowStart: "2047-05-17",
    targetWindowEnd: "2047-05-19",
    unitPriceBdt: 50_000,
    units: 10,
  });
  twoItemsVentureId = venture.id;
  await owner.client.ventures.startBuying({ id: venture.id });

  const manager = await as("manager", "2047-03-06T05:00:00.000Z");
  const straw = await manager.client.feed.addItem({
    name: { bn: `খড় ${suffix}` },
  });
  await manager.client.stock.receive({
    feedItemId: straw.id,
    kind: "purchase",
    quantity: 1000,
    priceBdt: 20_000,
    seller: { name: `খড়ের দোকান ${suffix}` },
    receivedOn: "2047-03-06",
  });
  const ration = await manager.client.feed.saveRation({
    name: { bn: `মিশ্র রেশন ${suffix}` },
    items: [
      { feedItemId: itemId, kgPerAnimalPerDay: 5 },
      { feedItemId: straw.id, kgPerAnimalPerDay: 5 },
    ],
  });
  await manager.client.feed.assignRation({
    penId: sharedPenId,
    rationId: ration.rationId,
  });

  // One of the Venture's, one of the Farm's, standing together and fed together.
  for (const forVenture of [venture.id, undefined]) {
    // oxlint-disable-next-line no-await-in-loop -- two arrivals, one after the other
    await manager.client.intake.record({
      penId: sharedPenId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 50_000,
      weightKg: 180,
      estimatedAgeMonths: 20,
      ventureId: forVenture,
      arrivedAt: new Date("2047-03-06T05:00:00.000Z"),
      targetWindowStart: "2047-05-17",
      targetWindowEnd: "2047-05-19",
    });
  }

  const scheduler = await as("owner", "2047-03-07T06:30:00.000Z");
  await scheduler.client.instances.ensureDue();
  const today = await scheduler.client.instances.today({ penId: sharedPenId });
  const instance = today.find((one) => one.definitionId === definitionId);
  const staff = await as("staff", "2047-03-07T06:30:00.000Z");
  await staff.client.instances.claim({ id: instance?.id ?? "" });
  await staff.client.instances.completeStep({
    instanceId: instance?.id ?? "",
    stepId: "feed",
    evidence: [true],
    feeding: [
      { feedItemId: itemId, givenKg: 20 },
      { feedItemId: straw.id, givenKg: 10 },
    ],
  });
};

beforeAll(async () => {
  const owner = await as("owner", "2047-03-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  await as("staff", "2047-03-01T04:00:00.000Z");
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-${suffix}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();

  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2047-03-20",
    targetWindowStart: "2047-05-17",
    targetWindowEnd: "2047-05-19",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 500_000,
  });
  ventureId = venture.id;
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${suffix}`,
    phone: "01955555555",
  });
  const agreement = await owner.client.ventures.sign({
    ventureId,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2047-03-02",
    stampSerial: `AA ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 1_000_000,
    movedOn: "2047-03-02",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.client.ventures.startBuying({ id: ventureId });

  // The Farm buys a sack of feed for the whole herd, as it always does.
  const manager = await as("manager", "2047-03-03T05:00:00.000Z");
  const item = await manager.client.feed.addItem({
    name: { bn: `দানাদার ${suffix}` },
  });
  itemId = item.id;
  await manager.client.stock.receive({
    feedItemId: itemId,
    kind: "purchase",
    quantity: 1000,
    priceBdt: 40_000,
    seller: { name: `ডিলার ${suffix}` },
    receivedOn: "2047-03-03",
  });

  // One bull of the Venture's, standing in that Pen and eating that feed.
  const buying = await as("manager", "2047-03-04T06:00:00.000Z");
  await buying.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    ventureId,
    arrivedAt: new Date("2047-03-04T05:00:00.000Z"),
    targetWindowStart: "2047-05-17",
    targetWindowEnd: "2047-05-19",
  });

  // A Pen is fed against its Ration, so the Pen has to be on one.
  const ration = await manager.client.feed.saveRation({
    name: { bn: `রেশন ${suffix}` },
    items: [{ feedItemId: itemId, kgPerAnimalPerDay: 5 }],
  });
  await manager.client.feed.assignRation({
    penId,
    rationId: ration.rationId,
  });

  ({ definitionId } = await owner.client.sops.create({ content: feedSop() }));
  const scheduler = await as("owner", "2047-03-05T06:30:00.000Z");
  await scheduler.client.instances.ensureDue();
  const today = await scheduler.client.instances.today({ penId });
  const instance = today.find((one) => one.definitionId === definitionId);
  const staff = await as("staff", "2047-03-05T06:30:00.000Z");
  await staff.client.instances.claim({ id: instance?.id ?? "" });
  await staff.client.instances.completeStep({
    instanceId: instance?.id ?? "",
    stepId: "feed",
    evidence: [true],
    feeding: [{ feedItemId: itemId, givenKg: 50 }],
  });
  await aMixedPen();
});

describe("the monthly Reimbursement", () => {
  it("is what its animals consumed, and says what it is made of", async () => {
    const owner = await as("owner", "2047-04-01T04:00:00.000Z");
    const consumed = await owner.client.ventures.consumption({
      ventureId,
      month: MONTH,
    });
    // Fifty kilos of a forty-taka feed, eaten by the one bull standing there.
    expect(consumed.feedBdt).toBe(2000);
    expect(consumed.totalBdt).toBe(2000);
    expect(consumed.madeOf.feed).toEqual([
      expect.objectContaining({ id: itemId, bdt: 2000 }),
    ]);
  });

  it("moves it out of the Venture and into the Farm's books, both sides at once", async () => {
    const owner = await as("owner", "2047-04-02T04:00:00.000Z");
    const before = await owner.client.ventures.list();
    const heldBefore =
      before.find((one) => one.id === ventureId)?.balanceBdt ?? 0;

    await owner.client.ventures.reimburse({
      ventureId,
      month: MONTH,
      movedOn: "2047-04-02",
      paymentMethod: "bank",
      reference: `REI-${suffix}`,
      amountBdt: 2000,
    });

    const after = await owner.client.ventures.list();
    const venture = after.find((one) => one.id === ventureId);
    // Out of the Venture Account, off the Running Budget — it is the cost of keeping them.
    expect(venture).toMatchObject({
      balanceBdt: heldBefore - 2000,
      cattleBudgetHeldBdt: 500_000,
    });

    // And in on the Farm's own books, gross: the feed it bought is still its expense.
    const money = await owner.client.money.list({
      from: "2047-04-01",
      to: "2047-04-30",
    });
    const paid = money.events.find((one) => one.source === "reimbursement");
    expect(paid).toMatchObject({
      amountBdt: 2000,
      direction: "in",
      purse: null,
    });
  });

  it("splits a feeding across its items and the animals that ate it", async () => {
    const owner = await as("owner", "2047-04-10T04:00:00.000Z");
    const consumed = await owner.client.ventures.consumption({
      ventureId: twoItemsVentureId,
      month: MONTH,
    });
    // Twenty kilos of a forty-taka feed and ten of a twenty-taka one, eaten by two animals of which
    // one is this Venture's: half of 800 + 200.
    expect(consumed.feedBdt).toBe(500);
    expect(
      consumed.madeOf.feed.map((one) => one.bdt).toSorted((a, b) => a - b)
    ).toEqual([100, 400]);
  });

  it("does not take the same month twice", async () => {
    const owner = await as("owner", "2047-04-03T04:00:00.000Z");
    await expect(
      owner.client.ventures.reimburse({
        ventureId,
        month: MONTH,
        movedOn: "2047-04-03",
        paymentMethod: "bank",
        reference: `REI2-${suffix}`,
        amountBdt: 2000,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "month_already_reimbursed" },
    });
  });

  it("takes nothing for a month its animals consumed nothing in", async () => {
    const owner = await as("owner", "2047-04-04T04:00:00.000Z");
    const quiet = await owner.client.ventures.consumption({
      ventureId,
      month: "2047-02",
    });
    expect(quiet.totalBdt).toBe(0);
    await expect(
      owner.client.ventures.reimburse({
        ventureId,
        month: "2047-02",
        movedOn: "2047-04-04",
        paymentMethod: "bank",
        reference: `REI3-${suffix}`,
        amountBdt: 0,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "nothing_to_reimburse" },
    });
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2047-04-05T04:00:00.000Z");
    await expect(
      manager.client.ventures.consumption({ ventureId, month: MONTH })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.client.ventures.reimburse({
        ventureId,
        month: "2047-04",
        movedOn: "2047-04-05",
        paymentMethod: "bank",
        reference: `REI4-${suffix}`,
        amountBdt: 0,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

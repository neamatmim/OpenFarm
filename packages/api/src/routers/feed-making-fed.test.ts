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
 * Feed made on the farm, fed (ADR 0031): a Venture's bull eating a home mix is charged at what went into it, the bran
 * mixed into it is charged to nobody — it is a transfer inside the store — and a making some of whose feed has been
 * eaten is put right, never voided.
 */
const suffix = `made-fed-${Date.now()}`;
const MONTH = { from: "2083-01-01", to: "2083-01-31" };

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
let branId = "";
let mixId = "";
let definitionId = "";
let makingId = "";

/** One morning's round in the pen: this much of the mix. */
const fedOn = async (day: string, givenKg: number) => {
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
    feeding: [{ feedItemId: mixId, givenKg }],
  });
};

beforeAll(async () => {
  const owner = await as("owner", "2083-01-01T04:00:00.000Z");
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2083-01-01",
    targetWindowStart: "2083-09-01",
    targetWindowEnd: "2083-09-05",
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  ventureId = venture.id;
  await putCapitalIn(
    owner.client,
    { id: ventureId, units: 20, unitPriceMoney: 50_000 },
    suffix,
    "2083-01-01"
  );
  await owner.client.ventures.startBuying({ id: ventureId });
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  await as("staff", "2083-01-01T04:00:00.000Z");
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-${suffix}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId,
    })
    .onConflictDoNothing();

  const manager = await as("manager", "2083-01-01T05:00:00.000Z");
  const bran = await manager.client.feed.items.create({
    name: { bn: `ভুসি ${suffix}` },
  });
  branId = bran.id;
  const mix = await manager.client.feed.items.create({
    name: { bn: `মিশ্রণ ${suffix}` },
  });
  mixId = mix.id;
  // Bran at 40 a kilo.
  await manager.client.stock.receive({
    feedItemId: branId,
    kind: "purchase",
    quantity: 1000,
    priceMoney: 40_000,
    seller: { name: `ডিলার ${suffix}` },
    receivedOn: "2083-01-01",
  });
  const ration = await manager.client.feed.rations.save({
    name: { bn: `রেশন ${suffix}` },
    items: [{ feedItemId: mixId, kgPerAnimalPerDay: 10 }],
  });
  await manager.client.feed.rations.assign({
    penId,
    rationId: ration.rationId,
  });
  ({ definitionId } = await owner.client.sops.create({ content: feedSop() }));

  // The Venture's one bull at the gate.
  const buyer = await as("owner", "2083-01-02T06:00:00.000Z");
  await buyer.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `প্রতিবেশী ${suffix}` },
    purchasePriceMoney: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2083-01-02T05:00:00.000Z"),
    ventureId,
    ...PAID_FROM_THE_ACCOUNT,
  });

  // 100 kg of bran — 4,000 taka — mixed into 80 kg: 50 a kilo.
  const mixer = await as("manager", "2083-01-09T05:00:00.000Z");
  ({ id: makingId } = await mixer.client.feedMaking.make({
    outputFeedItemId: mixId,
    madeAt: new Date("2083-01-09T05:00:00.000Z"),
    inputs: [{ feedItemId: branId, quantity: 100 }],
    cameOut: { quantity: 80 },
  }));
  await fedOn("2083-01-10", 10);
});

describe("made feed, fed", () => {
  it("charges a Venture's bull at what went into it, and the bran mixed into it to nobody", async () => {
    const owner = await as("owner", "2083-02-02T04:00:00.000Z");
    const january = await owner.client.ventures.consumption({
      ventureId,
      month: "2083-01",
    });
    // Ten kilos at 50: 500 taka — not the 4,000 of bran that went into the mixer as well.
    expect(january).toMatchObject({ unpricedKg: 0, totalMoney: 500 });
    const bySide = await owner.client.costs.bySide(MONTH);
    expect(bySide.fattening).toMatchObject({ feedMoney: 500, unpricedKg: 0 });
    expect(bySide.unallocated).toMatchObject({ feedMoney: 0 });
  });

  it("is never moved to a day after it was eaten: the mix made the day after the bull ate it", async () => {
    // The mix was made on the 9th and the bull ate it on the 10th; made on the 11th, it would come out on the 11th
    // with it, and the 10th's Feeding would have eaten feed that was not there, at no price.
    const manager = await as("manager", "2083-01-11T03:00:00.000Z");
    await expect(
      manager.client.feedMaking.correct({
        id: makingId,
        reason: "১১ তারিখে মেশানো",
        changes: {
          madeAt: {
            from: "2083-01-09T05:00:00.000Z",
            to: new Date("2083-01-11T02:00:00.000Z"),
          },
        },
      })
    ).rejects.toMatchObject({
      data: {
        refusal: "not_enough_in_the_store",
        short: [{ feedItemId: mixId }],
      },
    });
  });

  it("is never voided once some of it has been eaten", async () => {
    const manager = await as("manager", "2083-01-11T04:00:00.000Z");
    await expect(
      manager.client.feedMaking.correct({
        id: makingId,
        reason: "ভুল করে লেখা",
        changes: { voided: { from: false, to: true } },
      })
    ).rejects.toMatchObject({
      data: { refusal: "making_output_used" },
    });
  });

  it("is never put right to less than what has been eaten, and re-prices what was", async () => {
    const manager = await as("manager", "2083-01-11T05:00:00.000Z");
    await expect(
      manager.client.feedMaking.correct({
        id: makingId,
        reason: "৫ কেজি হয়েছিল",
        changes: { quantity: { from: 80, to: 5 } },
      })
    ).rejects.toMatchObject({
      data: {
        refusal: "not_enough_in_the_store",
        short: [{ feedItemId: mixId }],
      },
    });
    // 4,000 taka over 40 kg is 100 a kilo: the ten the bull ate now cost 1,000.
    await manager.client.feedMaking.correct({
      id: makingId,
      reason: "৪০ কেজি হয়েছিল, ৮০ নয়",
      changes: { quantity: { from: 80, to: 40 } },
    });
    const owner = await as("owner", "2083-02-02T04:00:00.000Z");
    const january = await owner.client.ventures.consumption({
      ventureId,
      month: "2083-01",
    });
    expect(january.totalMoney).toBe(1000);
  });
});

describe("the store, moment by moment", () => {
  it("refuses a Making moved back to before its feed came, though the store's lowest point is no lower", async () => {
    // 30 kg of the mix left; pressed into pellets on the 11th; then 40 fed on the 12th that nobody wrote coming in, so
    // the book is 40 short from the 12th. Moved back to the 8th, the pellets take 30 of a mix that came on the 9th:
    // nothing on the 8th, now 30 short — never as low as the 12th, and still a shortfall that was not there.
    const manager = await as("manager", "2083-01-11T05:00:00.000Z");
    const pellet = await manager.client.feed.items.create({
      name: { bn: `পেলেট ${suffix}` },
    });
    const pressed = await manager.client.feedMaking.make({
      outputFeedItemId: pellet.id,
      madeAt: new Date("2083-01-11T05:00:00.000Z"),
      inputs: [{ feedItemId: mixId, quantity: 30 }],
      cameOut: { quantity: 30 },
    });
    await fedOn("2083-01-12", 40);
    const later = await as("manager", "2083-01-13T04:00:00.000Z");
    await expect(
      later.client.feedMaking.correct({
        id: pressed.id,
        reason: "৮ তারিখে বানানো",
        changes: {
          madeAt: {
            from: "2083-01-11T05:00:00.000Z",
            to: new Date("2083-01-08T05:00:00.000Z"),
          },
        },
      })
    ).rejects.toMatchObject({
      data: {
        refusal: "not_enough_in_the_store",
        short: [{ feedItemId: mixId }],
      },
    });
  });

  it("charges a Feeding at seven for the mix made at six, though it was written up at eleven", async () => {
    // Mix bought on the 1st: 100 kg for 5,000, of which 60 stand once the 40 owed is taken — 50 a kilo.
    const buying = await as("manager", "2083-02-01T03:00:00.000Z");
    await buying.client.stock.receive({
      feedItemId: mixId,
      kind: "purchase",
      quantity: 100,
      priceMoney: 5000,
      seller: { name: `ডিলার ${suffix}` },
      receivedOn: "2083-02-01",
    });
    // On the 5th the bull is fed at half past six; the Manager mixed 20 kg from 100 kg of bran at six, and writes it up
    // at eleven. 60 kg at 50 and 20 at 200: 80 kg at 87.50, which is what the half past six Feeding ate.
    await fedOn("2083-02-05", 10);
    const writing = await as("manager", "2083-02-05T05:00:00.000Z");
    await writing.client.feedMaking.make({
      outputFeedItemId: mixId,
      madeAt: new Date("2083-02-05T00:00:00.000Z"),
      inputs: [{ feedItemId: branId, quantity: 100 }],
      cameOut: { quantity: 20 },
    });
    const owner = await as("owner", "2083-03-02T04:00:00.000Z");
    const february = await owner.client.ventures.consumption({
      ventureId,
      month: "2083-02",
    });
    expect(february.totalMoney).toBe(875);
  });
});

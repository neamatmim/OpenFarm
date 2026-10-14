import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A settled Venture and feed made on the farm (ADR 0031). Its bull ate pellets pressed from a mix that was mixed from
 * bran: so the bran's price, the mix's making and any made feed brought into the pellets' store before he ate them all
 * move what the Venture was settled on, two Makings down the chain — and each is refused, as a Feed In put right is.
 */
const suffix = `made-settled-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

type Owner = Awaited<ReturnType<typeof as>>;

const plan = {
  targetCapitalMoney: 500_000,
  floorMoney: 0,
  decideBy: "2087-01-03",
  targetWindowStart: "2087-01-18",
  targetWindowEnd: "2087-01-20",
  unitPriceMoney: 50_000,
  units: 10,
  cattleBudgetMoney: 400_000,
};

const feedSop = (): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix}` },
  purpose: { bn: "পেনে খাবার দেওয়া" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "feed",
      text: { bn: "খাওয়ান" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "feeding" },
    },
  ],
});

let penId = "";
let feedSopId = "";
let ventureId = "";
let ventureName = "";
let bran = "";
let mix = "";
let pellet = "";
let branArrivalId = "";
let mixMakingId = "";
let pitId = "";

/** A Venture signed for, paid into, and with one bull bought on its own Float and brought home. */
const aVentureWithABull = async (owner: Owner) => {
  const name = `ভেঞ্চার ${suffix}`;
  const venture = await owner.client.ventures.open({ name, ...plan });
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${suffix}`,
    phone: "01940000087",
  });
  const agreement = await owner.client.ventures.agreements.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: 10,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2087-01-01",
    stampSerial: `AA ${suffix}`,
  });
  await owner.client.ventures.agreements.keepPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: 500_000,
    movedOn: "2087-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.client.ventures.startBuying({ id: venture.id });
  const buying = await as("owner", "2087-01-04T04:00:00.000Z");
  const trip = await buying.client.buyingTrips.record({
    wentTo: `হাট ${suffix}`,
    wentOn: "2087-01-04",
    brokerMoney: 0,
    transportMoney: 0,
    keepMoney: 0,
  });
  await buying.client.ventures.floats.draw({
    ventureId: venture.id,
    buyingTripId: trip.id,
    amountMoney: 200_000,
    movedOn: "2087-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const manager = await as("manager", "2087-01-04T05:00:00.000Z");
  const bull = await manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 100_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    buyingTripId: trip.id,
    ventureId: venture.id,
    arrivedAt: new Date("2087-01-04T05:00:00.000Z"),
    targetWindowStart: plan.targetWindowStart,
    targetWindowEnd: plan.targetWindowEnd,
  });
  await buying.client.ventures.floats.reconcile({
    buyingTripId: trip.id,
    cashBackMoney: 100_000,
    movedOn: "2087-01-04",
    reference: `DEP-${suffix}`,
  });
  return { id: venture.id, name, tagNumber: bull.tagNumber };
};

const settleAndPayOut = async () => {
  const reading = await as("owner", "2087-02-01T04:00:00.000Z");
  const held = await reading.client.ventures.list();
  await reading.client.ventures.checkTheBank({
    ventureId,
    month: "2087-01",
    readMoney: held.find((one) => one.id === ventureId)?.balanceMoney ?? 0,
  });
  const paying = await as("owner", "2087-02-02T04:00:00.000Z");
  const consumed = await paying.client.ventures.consumption({
    ventureId,
    month: "2087-01",
  });
  await paying.client.ventures.reimburse({
    ventureId,
    month: "2087-01",
    movedOn: "2087-02-02",
    paymentMethod: "bank",
    reference: `REI-${suffix}`,
    amountMoney: consumed.totalMoney,
  });
  const settling = await as("owner", "2087-03-02T04:00:00.000Z");
  const reread = await settling.client.ventures.list();
  await settling.client.ventures.checkTheBank({
    ventureId,
    month: "2087-02",
    readMoney: reread.find((one) => one.id === ventureId)?.balanceMoney ?? 0,
  });
  await settling.client.ventures.settlement.approve({ ventureId });
  const approved = await settling.client.ventures.settlement.approved({
    ventureId,
  });
  for (const his of approved?.shares ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor at a time
    await settling.client.ventures.settlement.pay({
      ventureId,
      agreementId: his.agreementId,
      amountMoney: his.payoutMoney,
      movedOn: "2087-03-02",
      paymentMethod: "bank",
      reference: `PAY-${suffix}-${his.agreementId.slice(-6)}`,
    });
  }
  if ((approved?.farmMoney ?? 0) > 0) {
    await settling.client.ventures.settlement.takeTheFarmsShare({
      ventureId,
      movedOn: "2087-03-02",
      paymentMethod: "bank",
      reference: `FARM-${suffix}`,
    });
  }
};

beforeAll(async () => {
  const owner = await as("owner", "2087-01-01T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const venture = await aVentureWithABull(owner);
  ventureId = venture.id;
  ventureName = venture.name;

  const manager = await as("manager", "2087-01-05T03:00:00.000Z");
  for (const [key, bn] of [
    ["bran", "ভুসি"],
    ["mix", "মিশ্রণ"],
    ["pellet", "পেলেট"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one name index
    const made = await manager.client.feed.items.create({
      name: { bn: `${bn} ${suffix}` },
    });
    if (key === "bran") {
      bran = made.id;
    } else if (key === "mix") {
      mix = made.id;
    } else {
      pellet = made.id;
    }
  }
  ({ id: branArrivalId } = await manager.client.stock.receive({
    feedItemId: bran,
    kind: "purchase",
    quantity: 1000,
    priceMoney: 40_000,
    seller: { name: `ডিলার ${suffix}` },
    receivedOn: "2087-01-05",
  }));
  // Bran into a mix, the mix into pellets, the same morning; and a pit of bran packed to open as pellets later.
  const mixer = await as("manager", "2087-01-05T04:00:00.000Z");
  ({ id: mixMakingId } = await mixer.client.feedMaking.make({
    outputFeedItemId: mix,
    madeOn: "2087-01-05",
    inputs: [{ feedItemId: bran, quantity: 100 }],
    cameOut: { quantity: 80 },
  }));
  const presser = await as("manager", "2087-01-05T05:00:00.000Z");
  await presser.client.feedMaking.make({
    outputFeedItemId: pellet,
    madeOn: "2087-01-05",
    inputs: [{ feedItemId: mix, quantity: 50 }],
    cameOut: { quantity: 50 },
  });
  ({ id: pitId } = await presser.client.feedMaking.make({
    outputFeedItemId: pellet,
    madeOn: "2087-01-05",
    inputs: [{ feedItemId: bran, quantity: 100 }],
  }));
  const ration = await presser.client.feed.rations.save({
    name: { bn: `রেশন ${suffix}` },
    items: [{ feedItemId: pellet, kgPerAnimalPerDay: 10 }],
  });
  await presser.client.feed.rations.assign({
    penId,
    rationId: ration.rationId,
  });
  ({ definitionId: feedSopId } = await owner.client.sops.create({
    content: feedSop(),
  }));

  // The Venture's bull eats ten kilos of the pellets on the 6th.
  const feeding = await as("manager", "2087-01-06T06:30:00.000Z");
  await feeding.client.work.ensureDue();
  const today = await feeding.client.work.today({ penId });
  const round = today.find((one) => one.definitionId === feedSopId);
  await feeding.client.work.claim({ id: round?.id ?? "" });
  await feeding.client.work.completeStep({
    instanceId: round?.id ?? "",
    stepId: "feed",
    evidence: [true],
    feeding: [{ feedItemId: pellet, givenKg: 10 }],
  });

  const selling = await as("manager", "2087-01-19T05:00:00.000Z");
  await selling.client.sales.record({
    tagNumber: venture.tagNumber,
    buyer: { name: `ক্রেতা ${suffix}` },
    priceMoney: 300_000,
    weightKg: 320,
    destination: `ঢাকা ${suffix}`,
    vehicle: `ঢাকা মেট্রো ${suffix}`,
    driver: `চালক ${suffix}`,
    paymentMethod: "bank",
  });
  await settleAndPayOut();
});

const SETTLED = { data: { refusal: "venture_is_settled" } };

describe("feed made on the farm, and a settled Venture that ate it", () => {
  it("has a settled Venture to stand in the way", async () => {
    const venture = await scratchDb().query.venture.findFirst({
      where: { id: ventureId },
      columns: { state: true },
    });
    expect(venture?.state).toBe("settled");
  });

  it("refuses the bran's price put right: the pellets two Makings down were priced through it", async () => {
    const owner = await as("owner", "2087-03-05T04:00:00.000Z");
    await expect(
      owner.client.stock.correct({
        id: branArrivalId,
        reason: "দাম ৪৫,০০০ ছিল",
        changes: { priceMoney: { from: 40_000, to: 45_000 } },
      })
    ).rejects.toMatchObject({
      ...SETTLED,
      data: { ventures: [{ id: ventureId, name: ventureName }] },
    });
  });

  it("refuses the mix put right, whose pellets the bull ate", async () => {
    const owner = await as("owner", "2087-03-05T04:00:00.000Z");
    await expect(
      owner.client.feedMaking.correct({
        id: mixMakingId,
        reason: "৭০ কেজি হয়েছিল",
        changes: { quantity: { from: 80, to: 70 } },
      })
    ).rejects.toMatchObject(SETTLED);
  });

  it("refuses pellets made and dated back before he ate them", async () => {
    const owner = await as("owner", "2087-03-05T04:00:00.000Z");
    await expect(
      owner.client.feedMaking.make({
        outputFeedItemId: pellet,
        madeOn: "2087-01-06",
        inputs: [{ feedItemId: bran, quantity: 10 }],
        cameOut: { quantity: 10 },
      })
    ).rejects.toMatchObject(SETTLED);
  });

  it("refuses the pit opened on the morning he ate, and takes it opened today", async () => {
    const owner = await as("owner", "2087-03-05T04:00:00.000Z");
    await expect(
      owner.client.feedMaking.cameOut({
        id: pitId,
        quantity: 90,
        cameOutOn: "2087-01-06",
      })
    ).rejects.toMatchObject(SETTLED);
    await owner.client.feedMaking.cameOut({
      id: pitId,
      quantity: 90,
      cameOutOn: "2087-03-05",
    });
  });
});

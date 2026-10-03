import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The Running Budget runs low, and the Owner's own money covers the gap: interest-free, never a charge
 * against the Venture, and owed back at cost before any capital returns.
 */
const suffix = `advance-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalMoney: 1_000_000,
  floorMoney: 0,
  decideBy: "2047-05-20",
  targetWindowStart: "2047-08-17",
  targetWindowEnd: "2047-08-19",
  unitPriceMoney: 50_000,
  units: 20,
  /** Eight lakh for cattle, so two lakh keeps them. */
  cattleBudgetMoney: 800_000,
};

const feedSop = (): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix}`, en: "Feeding" },
  purpose: { bn: "পেনে খাবার দেওয়া" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  assignedRole: "staff",
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

type Owner = Awaited<ReturnType<typeof as>>;

let ventureId = "";

/** A Venture funded and buying, with its Running Budget intact. */
const funded = async (owner: Owner, which: number) => {
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${which} ${suffix}`,
    ...plan,
  });
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${which} ${suffix}`,
    phone: `0196${String(which).padStart(7, "0")}`,
  });
  const agreement = await owner.client.ventures.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2047-05-02",
    stampSerial: `AA ${which} ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: 1_000_000,
    movedOn: "2047-05-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}-${which}`,
  });
  await owner.client.ventures.startBuying({ id: venture.id });
  return venture.id;
};

const theVenture = async (owner: Owner) => {
  const ventures = await owner.client.ventures.list();
  return ventures.find((one) => one.id === ventureId);
};

/** A Pen of this Venture's animals, fed enough that a month's Reimbursement bites. */
const theyEat = async (owner: Owner) => {
  const shed = await owner.client.sheds.createShed({ name: suffix });
  const pen = await owner.client.sheds.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  await as("staff", "2047-05-04T04:00:00.000Z");
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-${suffix}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();

  const manager = await as("manager", "2047-05-04T05:00:00.000Z");
  const item = await manager.client.feed.createItem({
    name: { bn: `দানাদার ${suffix}` },
  });
  await manager.client.stock.receive({
    feedItemId: item.id,
    kind: "purchase",
    quantity: 10_000,
    priceMoney: 400_000,
    seller: { name: `ডিলার ${suffix}` },
    receivedOn: "2047-05-04",
  });
  const ration = await manager.client.feed.saveRation({
    name: { bn: `রেশন ${suffix}` },
    items: [{ feedItemId: item.id, kgPerAnimalPerDay: 5 }],
  });
  await manager.client.feed.assignRation({
    penId: pen.id,
    rationId: ration.rationId,
  });
  // At the gate, so the Owner's, paid from the Venture Account by bank.
  const buyer = await as("owner", "2047-05-04T05:00:00.000Z");
  await buyer.client.intakes.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    ventureId,
    ...PAID_FROM_THE_ACCOUNT,
    arrivedAt: new Date("2047-05-04T05:00:00.000Z"),
    targetWindowStart: "2047-08-17",
    targetWindowEnd: "2047-08-19",
  });

  const sop = await owner.client.sops.create({ content: feedSop() });
  const scheduler = await as("owner", "2047-05-05T06:30:00.000Z");
  await scheduler.client.work.ensureDue();
  const today = await scheduler.client.work.today({ penId: pen.id });
  const instance = today.find((one) => one.definitionId === sop.definitionId);
  const staff = await as("staff", "2047-05-05T06:30:00.000Z");
  await staff.client.work.claim({ id: instance?.id ?? "" });
  // Four thousand one hundred kilos at forty taka: a hundred and sixty-four thousand of the two lakh,
  // which leaves less than the fifth the Owner set as her line.
  await staff.client.work.completeStep({
    instanceId: instance?.id ?? "",
    stepId: "feed",
    evidence: [true],
    feeding: [{ feedItemId: item.id, givenKg: 4100 }],
  });
};

beforeAll(async () => {
  const owner = await as("owner", "2047-05-01T04:00:00.000Z");
  // Her own line, and not the farm's default: a test that sets the default proves nothing.
  await owner.client.farm.setParameters({ runningBudgetWarnMoney: 40_000 });
  ventureId = await funded(owner, 1);
});

describe("the Running Budget", () => {
  it("says nothing while there is money to keep the animals with", async () => {
    const owner = await as("owner", "2047-05-04T04:00:00.000Z");
    const venture = await theVenture(owner);
    // Two lakh came in for keeping them, and none of it is spent.
    expect(venture).toMatchObject({
      runningBudgetHeldMoney: 200_000,
      runningBudgetLow: false,
    });
  });

  it("says so once it falls below the level the Owner set", async () => {
    const owner = await as("owner", "2047-05-05T04:00:00.000Z");
    // The animals eat their way through most of it, on the Farm's feed: owed the Farm until a Reimbursement repays it.
    await theyEat(owner);
    const trip = await owner.client.buyingTrips.record({
      wentTo: `হাট ${suffix}`,
      wentOn: "2047-05-05",
      brokerMoney: 0,
      transportMoney: 0,
      keepMoney: 0,
    });
    // The rest of the cattle money: the bull at the gate was paid for from it by bank.
    await owner.client.ventures.drawFloat({
      ventureId,
      buyingTripId: trip.id,
      amountMoney: 740_000,
      movedOn: "2047-05-05",
      paymentMethod: "bank",
      reference: `FLT-${suffix}`,
    });
    // The Float is cattle money, so the Running Budget the account holds is untouched by it — but what the animals
    // have eaten of the Farm's feed is owed the Farm, and what is really left is under her line already.
    const afterFloat = await theVenture(owner);
    expect(afterFloat).toMatchObject({
      runningBudgetHeldMoney: 200_000,
      owedTheFarmMoney: 164_000,
      runningBudgetLow: true,
    });

    // Then the month's feed is repaid, and what is left to keep them with is under the fifth the
    // Owner set as her line.
    const paying = await as("owner", "2047-06-02T04:00:00.000Z");
    await paying.client.ventures.reimburse({
      ventureId,
      month: "2047-05",
      movedOn: "2047-06-02",
      paymentMethod: "bank",
      reference: `REI-${suffix}`,
      amountMoney: 164_000,
    });
    const afterEating = await theVenture(paying);
    // Her line is forty thousand, and thirty-six is below it.
    expect(afterEating).toMatchObject({
      runningBudgetHeldMoney: 36_000,
      runningBudgetLow: true,
    });

    // Exactly on the line is not below it, and the farm says nothing. Read on a fresh client, because
    // a client carries the farm's parameters as they stood when it was made.
    await paying.client.farm.setParameters({ runningBudgetWarnMoney: 36_000 });
    const sinceChanged = await as("owner", "2047-06-03T04:00:00.000Z");
    const onTheLine = await theVenture(sinceChanged);
    expect(onTheLine?.runningBudgetLow).toBe(false);
    await sinceChanged.client.farm.setParameters({
      runningBudgetWarnMoney: 40_000,
    });
  });

  it("takes the Owner's own money in, and holds it against the Running Budget", async () => {
    const owner = await as("owner", "2047-05-06T04:00:00.000Z");
    const before = await theVenture(owner);
    const heldBefore = before?.runningBudgetHeldMoney ?? 0;

    await owner.client.ventures.advance({
      ventureId,
      amountMoney: 50_000,
      movedOn: "2047-05-06",
      paymentMethod: "bank",
      reference: `ADV-${suffix}`,
    });

    const after = await theVenture(owner);
    // Her money keeps the animals; it does not buy one more of them.
    expect(after).toMatchObject({
      advancedMoney: 50_000,
      runningBudgetHeldMoney: heldBefore + 50_000,
      cattleBudgetHeldMoney: before?.cattleBudgetHeldMoney ?? 0,
      balanceMoney: (before?.balanceMoney ?? 0) + 50_000,
    });
  });

  it("is never the Farm's money, and never the Venture's cost", async () => {
    const owner = await as("owner", "2047-05-07T04:00:00.000Z");
    const money = await owner.client.money.list({
      from: "2047-05-01",
      to: "2047-05-31",
    });
    // The Farm has neither spent nor earned by it: the Owner lent her own money to a run she looks
    // after. Only the feed she bought for the whole herd is in her books for that month.
    expect(money.events.every((one) => one.source === "feed_in")).toBe(true);
    // And it is not among what the Venture has spent, which is its animals' and nothing else: her
    // fifty thousand went in, and neither figure that says where the money went moved for it. The
    // bull at the gate, the Float it drew and the month it paid the Farm back are separate questions
    // and separate lines.
    const venture = await theVenture(owner);
    expect(venture).toMatchObject({
      advancedMoney: 50_000,
      spentMoney: 800_000,
      reimbursedMoney: 164_000,
    });
  });

  it("is refused in cash, and refused once the run is over", async () => {
    const owner = await as("owner", "2047-05-08T04:00:00.000Z");
    await expect(
      owner.client.ventures.advance({
        ventureId,
        amountMoney: 1000,
        movedOn: "2047-05-08",
        paymentMethod: "cash",
        reference: "হাতে হাতে",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "capital_must_be_by_bank" },
    });

    const calledOff = await owner.client.ventures.open({
      name: `বাতিল ${suffix}`,
      ...plan,
    });
    await owner.client.ventures.cancel({
      id: calledOff.id,
      reason: `সীমা ওঠেনি ${suffix}`,
    });
    await expect(
      owner.client.ventures.advance({
        ventureId: calledOff.id,
        amountMoney: 1000,
        movedOn: "2047-05-08",
        paymentMethod: "bank",
        reference: `ADV2-${suffix}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_wrong_state" },
    });
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2047-05-09T04:00:00.000Z");
    await expect(
      manager.client.ventures.advance({
        ventureId,
        amountMoney: 1000,
        movedOn: "2047-05-09",
        paymentMethod: "bank",
        reference: `ADV3-${suffix}`,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

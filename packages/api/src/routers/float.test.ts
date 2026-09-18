import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The Buying Float: money drawn from a Venture Account for one trip to the haat, so the Manager goes
 * with money that is accounted for — and so the Running Budget is not spent on one more bull.
 */
const suffix = `float-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2046-12-20",
  targetWindowStart: "2047-05-17",
  targetWindowEnd: "2047-05-19",
  unitPriceBdt: 50_000,
  units: 20,
  /** Three quarters for cattle, a quarter to keep them. */
  cattleBudgetBdt: 750_000,
};

const paper = {
  investorsPercent: 60,
  arbitrator: `মাওলানা ${suffix}`,
  stampValueBdt: 300,
  stampedOn: "2046-12-02",
  stampSerial: `AA ${suffix}`,
};

const photo = { contentType: "image/jpeg" as const, data: "aGVsbG8=" };

type Owner = Awaited<ReturnType<typeof as>>;

/** A Venture with capital in it, buying. */
const funded = async (owner: Owner, which: number, capitalBdt: number) => {
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${which} ${suffix}`,
    ...plan,
  });
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${which} ${suffix}`,
    phone: `0191${String(which).padStart(7, "0")}`,
  });
  const agreement = await owner.client.ventures.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: capitalBdt / plan.unitPriceBdt,
    ...paper,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    ...photo,
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: capitalBdt,
    movedOn: "2046-12-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}-${which}`,
  });
  await owner.client.ventures.startBuying({ id: venture.id });
  return venture.id;
};

/** One outing the farm wrote up. */
const outing = async (owner: Owner, which: number) => {
  const trip = await owner.client.trips.record({
    wentTo: `হাট ${which} ${suffix}`,
    wentOn: "2046-12-05",
    brokerBdt: 0,
    transportBdt: 0,
    keepBdt: 0,
  });
  return trip.id;
};

let ventureId = "";
let penId = "";

beforeAll(async () => {
  const owner = await as("owner", "2046-12-01T04:00:00.000Z");
  ventureId = await funded(owner, 1, 800_000);
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
});

describe("the Buying Float", () => {
  it("goes out to one outing, and comes off the Cattle Budget alone", async () => {
    const owner = await as("owner", "2046-12-05T04:00:00.000Z");
    const trip = await outing(owner, 1);
    const ventures = await owner.client.ventures.list();
    const before = ventures.find((one) => one.id === ventureId);
    // Eight lakh in, three quarters of it for cattle.
    expect(before).toMatchObject({
      balanceBdt: 800_000,
      cattleBudgetHeldBdt: 600_000,
      runningBudgetHeldBdt: 200_000,
      spentBdt: 0,
    });

    await owner.client.ventures.drawFloat({
      ventureId,
      buyingTripId: trip,
      amountBdt: 500_000,
      movedOn: "2046-12-05",
      paymentMethod: "bank",
      reference: `FLT-${suffix}-1`,
    });

    const afterwards = await owner.client.ventures.list();
    const after = afterwards.find((one) => one.id === ventureId);
    // The money that keeps the animals is untouched: a Float is cattle money.
    expect(after).toMatchObject({
      balanceBdt: 300_000,
      cattleBudgetHeldBdt: 100_000,
      runningBudgetHeldBdt: 200_000,
      spentBdt: 500_000,
    });
  });

  it("is refused for more than the Cattle Budget is holding", async () => {
    const owner = await as("owner", "2046-12-06T04:00:00.000Z");
    const trip = await outing(owner, 2);
    // A lakh is left of the cattle money, whatever the account still holds.
    await expect(
      owner.client.ventures.drawFloat({
        ventureId,
        buyingTripId: trip,
        amountBdt: 150_000,
        movedOn: "2046-12-06",
        paymentMethod: "bank",
        reference: `FLT-${suffix}-2`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "cattle_budget_short" },
    });
  });

  it("is refused twice for one outing", async () => {
    const owner = await as("owner", "2046-12-07T04:00:00.000Z");
    const trip = await outing(owner, 3);
    await owner.client.ventures.drawFloat({
      ventureId,
      buyingTripId: trip,
      amountBdt: 50_000,
      movedOn: "2046-12-07",
      paymentMethod: "bank",
      reference: `FLT-${suffix}-3`,
    });
    await expect(
      owner.client.ventures.drawFloat({
        ventureId,
        buyingTripId: trip,
        amountBdt: 10_000,
        movedOn: "2046-12-07",
        paymentMethod: "bank",
        reference: `FLT-${suffix}-3b`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "float_already_drawn" },
    });
  });

  it("is refused unless the Venture is buying, and refused in cash", async () => {
    const owner = await as("owner", "2046-12-08T04:00:00.000Z");
    const notYet = await owner.client.ventures.open({
      name: `এখনো খোলা ${suffix}`,
      ...plan,
    });
    const trip = await outing(owner, 4);
    await expect(
      owner.client.ventures.drawFloat({
        ventureId: notYet.id,
        buyingTripId: trip,
        amountBdt: 1000,
        movedOn: "2046-12-08",
        paymentMethod: "bank",
        reference: `FLT-${suffix}-4`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      owner.client.ventures.drawFloat({
        ventureId,
        buyingTripId: trip,
        amountBdt: 1000,
        movedOn: "2046-12-08",
        paymentMethod: "cash",
        reference: "হাতে হাতে",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is refused for an outing bringing another Venture's animals home", async () => {
    const owner = await as("owner", "2046-12-11T04:00:00.000Z");
    const other = await funded(owner, 2, 200_000);
    const trip = await outing(owner, 7);
    // The other Venture's bull comes home on this lorry.
    const manager = await as("manager", "2046-12-11T05:00:00.000Z");
    await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 50_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      buyingTripId: trip,
      ventureId: other,
      arrivedAt: new Date("2046-12-11T05:00:00.000Z"),
      targetWindowStart: "2047-05-17",
      targetWindowEnd: "2047-05-19",
    });
    // Money and animals pointing at different Ventures is a sum nobody could make balance.
    await expect(
      owner.client.ventures.drawFloat({
        ventureId,
        buyingTripId: trip,
        amountBdt: 10_000,
        movedOn: "2046-12-11",
        paymentMethod: "bank",
        reference: `FLT-${suffix}-7`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("never reaches the Farm's register", async () => {
    const owner = await as("owner", "2046-12-09T04:00:00.000Z");
    const money = await owner.client.money.list({
      from: "2046-12-01",
      to: "2046-12-31",
    });
    // A Float is the Venture's own money moving, not the Farm's income or its cost.
    expect(money.events).toEqual([]);
  });

  it("is the Manager's to see and the Owner's to draw", async () => {
    const owner = await as("owner", "2046-12-10T04:00:00.000Z");
    const trip = await outing(owner, 5);
    await owner.client.ventures.drawFloat({
      ventureId,
      buyingTripId: trip,
      amountBdt: 40_000,
      movedOn: "2046-12-10",
      paymentMethod: "bank",
      reference: `FLT-${suffix}-5`,
    });

    const manager = await as("manager", "2046-12-10T05:00:00.000Z");
    // She is taking it to the haat, so she may see what is in her hand.
    await expect(
      manager.client.ventures.floatOf({ buyingTripId: trip })
    ).resolves.toMatchObject({
      amountBdt: 40_000,
      reference: `FLT-${suffix}-5`,
      ventureName: `ভেঞ্চার 1 ${suffix}`,
    });
    // Drawing it is not hers.
    const another = await outing(owner, 6);
    await expect(
      manager.client.ventures.drawFloat({
        ventureId,
        buyingTripId: another,
        amountBdt: 1000,
        movedOn: "2046-12-10",
        paymentMethod: "bank",
        reference: `FLT-${suffix}-6`,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

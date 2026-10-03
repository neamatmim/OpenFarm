import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Venture pays for a bull one of two ways: its own Float on the outing she came home on, or — with no outing, at the
 * farm gate or from a neighbour — by bank straight from the Venture Account, with its reference. Never cash: no pocket
 * carries Investors' money, and the account falls by what she cost the moment she is taken in.
 */
const suffix = `by-bank-${Date.now()}`;
const DAY = "2074-03-05";

const as = (role: "owner" | "manager", instant = `${DAY}T06:00:00.000Z`) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

type Client = Awaited<ReturnType<typeof as>>;

let ventureId = "";
let penId = "";

beforeAll(async () => {
  const owner = await as("owner");
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2074-03-01",
    targetWindowStart: "2074-07-01",
    targetWindowEnd: "2074-07-05",
    unitPriceMoney: 50_000,
    units: 20,
    // Two lakh for cattle, so one dear bull is over it.
    cattleBudgetMoney: 200_000,
  });
  ventureId = venture.id;
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${suffix}`,
    phone: "01930000074",
  });
  const agreement = await owner.client.ventures.agreements.sign({
    ventureId,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2074-02-02",
    stampSerial: `AA ${suffix}`,
  });
  await owner.client.ventures.agreements.keepPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: 1_000_000,
    movedOn: "2074-02-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.client.ventures.startBuying({ id: ventureId });
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
});

/** A bull for the Venture at the farm gate, by whoever and however the sheet says. */
const atTheGate = async (
  who: Client,
  sheet: {
    paymentMethod?: "cash" | "bank" | "mobile_money";
    reference?: string;
    purchasePriceMoney?: number;
    buyingTripId?: string;
  }
) =>
  await who.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `প্রতিবেশী ${suffix}` },
    purchasePriceMoney: 60_000,
    marketTollMoney: 0,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(`${DAY}T05:00:00.000Z`),
    ventureId,
    ...sheet,
  });

const theVenture = async () => {
  const owner = await as("owner");
  const ventures = await owner.client.ventures.list();
  return ventures.find((one) => one.id === ventureId);
};

const movementsOf = async () => {
  const owner = await as("owner");
  return await owner.client.ventures.movements.list({ ventureId });
};

describe("a Venture's bull with no outing", () => {
  it("is refused in cash", async () => {
    const owner = await as("owner");
    await expect(
      atTheGate(owner, { paymentMethod: "cash" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_buys_by_bank" },
    });
    await expect(
      atTheGate(owner, { paymentMethod: "bank" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_buys_by_bank" },
    });
  });

  it("is paid by bank from the Venture Account, its price out of the Cattle Budget", async () => {
    const before = await theVenture();
    const owner = await as("owner");
    const hers = await atTheGate(owner, {
      paymentMethod: "bank",
      reference: `চেক ১২৩৪ ${suffix}`,
    });
    const after = await theVenture();
    expect(after?.balanceMoney).toBe((before?.balanceMoney ?? 0) - 60_000);
    expect(after?.cattleBudgetHeldMoney).toBe(
      (before?.cattleBudgetHeldMoney ?? 0) - 60_000
    );
    const movements = await movementsOf();
    expect(
      movements.find((one) => one.intakeId === hers.intakeId)
    ).toMatchObject({
      kind: "intake_out",
      amountMoney: 60_000,
      reference: `চেক ১২৩৪ ${suffix}`,
    });
  });

  it("is the Owner's, never more than the Cattle Budget holds, and never on an outing no Float of hers paid for", async () => {
    const manager = await as("manager");
    await expect(
      atTheGate(manager, {
        paymentMethod: "bank",
        reference: `চেক ১ ${suffix}`,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const owner = await as("owner");
    await expect(
      atTheGate(owner, {
        paymentMethod: "bank",
        reference: `চেক ২ ${suffix}`,
        purchasePriceMoney: 500_000,
      })
    ).rejects.toMatchObject({ data: { refusal: "cattle_budget_short" } });
    const trip = await owner.client.buyingTrips.record({
      wentTo: `হাট ${suffix}`,
      wentOn: DAY,
      brokerMoney: 0,
      transportMoney: 0,
      keepMoney: 0,
    });
    await expect(
      atTheGate(owner, { buyingTripId: trip.id })
    ).rejects.toMatchObject({ data: { refusal: "no_float_on_the_trip" } });
  });

  it("moves its payment when her price is put right, and drops it when she is the Farm's", async () => {
    const owner = await as("owner");
    const hers = await atTheGate(owner, {
      paymentMethod: "bank",
      reference: `চেক ৫৬ ${suffix}`,
    });
    const manager = await as("manager", `${DAY}T09:00:00.000Z`);
    await manager.client.intakes.correct({
      id: hers.intakeId,
      reason: `দাম আসলে কম ছিল ${suffix}`,
      changes: { purchasePriceMoney: { from: 60_000, to: 55_000 } },
    });
    const moved = await movementsOf();
    const itsOwn = moved.find((one) => one.intakeId === hers.intakeId);
    expect(itsOwn).toMatchObject({ kind: "intake_out", amountMoney: 55_000 });
    // The movement is written from the Intake, and put right only there.
    await expect(
      owner.client.ventures.movements.correct({
        id: itsOwn?.id ?? "",
        reason: `ভুল ${suffix}`,
        changes: { amountMoney: { from: 55_000, to: 50_000 } },
      })
    ).rejects.toMatchObject({ data: { refusal: "correct_the_record" } });
    await manager.client.intakes.correct({
      id: hers.intakeId,
      reason: `খামারের গরু ছিল ${suffix}`,
      changes: {
        owner: { from: ventureId, to: null },
        targetWindow: {
          from: { start: "2074-07-01", end: "2074-07-05" },
          to: { start: "2074-08-01", end: "2074-08-03" },
        },
      },
    });
    const dropped = await movementsOf();
    expect(dropped.map((one) => one.intakeId)).not.toContain(hers.intakeId);
  });
});

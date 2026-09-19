import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The lorry that takes a Venture's animals to the haat, and who ends up paying for it.
 *
 * The Farm pays the lorry and the men who went, on the day. A **Buying Trip** comes back out of the
 * Buying Float the same evening; a **Selling Trip** happens long after that Float is shut, so it has to
 * come back some other way — and until 2026-09-19 it never came back at all, while the Settlement
 * charged the Investors for it all the same. The Farm was out of pocket and the taka sat in a Venture
 * Account that the glossary says should read nothing.
 *
 * One run, all the way through, with nothing in it but what this needs: buy one bull, take him to the
 * haat, sell him, and try to shut the books.
 */
const suffix = `lorry-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 500_000,
  floorBdt: 0,
  decideBy: "2049-01-20",
  targetWindowStart: "2049-03-01",
  targetWindowEnd: "2049-03-10",
  unitPriceBdt: 50_000,
  units: 10,
  cattleBudgetBdt: 300_000,
};

/** What the lorry cost, and what the one bull it carried therefore owes. */
const LORRY_BDT = 7500;

let ventureId = "";
let agreementId = "";
let tagNumber = "";

beforeAll(async () => {
  const owner = await as("owner", "2049-01-01T04:00:00.000Z");
  await owner.client.farm.setIdentity({
    address: `গ্রাম: লরি ${suffix}`,
    registrationNumber: `DLS/${suffix}`.slice(0, 40),
    phone: "01711-000999",
  });
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });

  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    ...plan,
  });
  ventureId = venture.id;
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${suffix}`,
    phone: "01955000111",
  });
  const agreement = await owner.client.ventures.sign({
    ventureId,
    investorId: person.id,
    units: 10,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampSerial: `AA ${suffix}`,
    stampedOn: "2049-01-02",
  });
  agreementId = agreement.id;
  await owner.client.ventures.keepAgreementPaper({
    agreementId,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId,
    amountBdt: 500_000,
    movedOn: "2049-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.client.ventures.startBuying({ id: ventureId });

  // One bull, bought out of a Float that is drawn and closed the same day — so the Buying Trip is
  // paid for and settled between them before any of this begins.
  const buying = await as("owner", "2049-01-04T04:00:00.000Z");
  const trip = await buying.client.trips.record({
    wentTo: `কেনার হাট ${suffix}`,
    wentOn: "2049-01-04",
    brokerBdt: 0,
    transportBdt: 0,
    keepBdt: 0,
  });
  await buying.client.ventures.drawFloat({
    ventureId,
    buyingTripId: trip.id,
    amountBdt: 200_000,
    movedOn: "2049-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const manager = await as("manager", "2049-01-04T05:00:00.000Z");
  const her = await manager.client.intake.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 150_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    buyingTripId: trip.id,
    ventureId,
    arrivedAt: new Date("2049-01-04T05:00:00.000Z"),
    targetWindowStart: plan.targetWindowStart,
    targetWindowEnd: plan.targetWindowEnd,
  });
  ({ tagNumber } = her);
  await buying.client.ventures.reconcileFloat({
    buyingTripId: trip.id,
    cashBackBdt: 50_000,
    movedOn: "2049-01-04",
    reference: `DEP-${suffix}`,
  });
  await buying.client.ventures.startFattening({ id: ventureId });

  // February: the lorry to the haat, and the bull sold off it.
  const selling = await as("manager", "2049-02-10T05:00:00.000Z");
  await selling.client.sellingTrips.record({
    wentTo: `বিক্রির হাট ${suffix}`,
    transportBdt: LORRY_BDT,
    keepBdt: 0,
    animals: [tagNumber],
    wentOn: new Date("2049-02-10T05:00:00.000Z"),
    paymentMethod: "cash",
  });
  await selling.client.sale.record({
    tagNumber,
    buyer: { name: `ক্রেতা ${suffix}` },
    priceBdt: 300_000,
    weightKg: 320,
    destination: `ঢাকা ${suffix}`,
    vehicle: `ঢাকা মেট্রো ${suffix}`,
    driver: `চালক ${suffix}`,
    paymentMethod: "bank",
  });
});

describe("the lorry that took them to the haat", () => {
  it("is the whole of what February owes, and the Venture owes it", async () => {
    const owner = await as("owner", "2049-03-01T04:00:00.000Z");
    const month = await owner.client.ventures.consumption({
      ventureId,
      month: "2049-02",
    });
    // Nothing was fed, dosed or seen by a Vet, and no Herd Cost was marked: the lorry is all there is.
    expect(month).toMatchObject({
      feedBdt: 0,
      medicineBdt: 0,
      vetBdt: 0,
      herdBdt: 0,
      tripsBdt: LORRY_BDT,
      totalBdt: LORRY_BDT,
    });
    expect(month.madeOf.trips).toEqual([
      expect.objectContaining({
        bdt: LORRY_BDT,
        nameBn: `বিক্রির হাট ${suffix}`,
      }),
    ]);
  });

  it("will not let the books shut until the Farm has been paid back for it", async () => {
    const owner = await as("owner", "2049-03-02T04:00:00.000Z");
    // Everything else is in order — the bull is gone, his price is known, the Float came home — and it
    // still refuses, because the Farm paid for that lorry and nobody has paid the Farm.
    await expect(
      owner.client.ventures.approveSettlement({ ventureId })
    ).rejects.toMatchObject({
      data: { refusal: "a_reimbursement_is_owed" },
    });
    const showing = await owner.client.ventures.settlement({ ventureId });
    expect(
      showing.blocks.find((one) => one.word === "a_reimbursement_is_owed")
    ).toMatchObject({ months: ["2049-02"] });
  });

  it("leaves the account reading nothing once it has been", async () => {
    const owner = await as("owner", "2049-03-03T04:00:00.000Z");
    await owner.client.ventures.reimburse({
      ventureId,
      month: "2049-02",
      amountBdt: LORRY_BDT,
      movedOn: "2049-03-03",
      paymentMethod: "bank",
      reference: `RMB-${suffix}`,
    });
    // Every month it ran, read against the bank and agreeing — a Settlement will not close over one
    // that is still out. What the statement said is what the farm believed it would say.
    for (const [month, readBdt] of [
      ["2049-01", 350_000],
      ["2049-02", 650_000],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one month's statement at a time
      const said = await owner.client.ventures.checkTheBank({
        ventureId,
        month,
        readBdt,
      });
      expect(said.differenceBdt).toBe(0);
    }

    await owner.client.ventures.approveSettlement({ ventureId });
    const approved = await owner.client.ventures.approvedSettlement({
      ventureId,
    });
    const [his] = approved?.shares ?? [];
    await owner.client.ventures.paySettlement({
      ventureId,
      agreementId,
      amountBdt: his?.payoutBdt ?? 0,
      movedOn: "2049-03-03",
      paymentMethod: "bank",
      reference: `PAY-${suffix}`,
    });
    await owner.client.ventures.takeTheFarmsShare({
      ventureId,
      movedOn: "2049-03-03",
      paymentMethod: "bank",
      reference: `FARM-${suffix}`,
    });

    // The whole of it: the Farm's own money never stays in a Venture Account, and neither does a
    // taka of the lorry it paid for. This is the figure the defect was found by — it read ৳9,001
    // on the demo farm, and the ৳9,001 was that farm's Selling Trip to the taka.
    const after = await owner.client.ventures.list();
    expect(after.find((one) => one.id === ventureId)).toMatchObject({
      state: "settled",
      balanceBdt: 0,
    });
  });
});

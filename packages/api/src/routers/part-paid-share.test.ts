import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Venture may start buying while an Agreement is only part paid: the Floor is the only thing it asks. Capital comes
// back as it was paid; the share of a profit or a loss must divide the same way, or a man takes a share of the run for
// money he never put in, and everybody who did pay is diluted by it.

const suffix = `${Date.now()}`.slice(-7);
const UNIT_PRICE = 50_000;

const as = async (role: "owner" | "manager", at: string) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
  });
  return client;
};

let ventureId = "";
let paidInFull = "";
let partPaid = "";

/** Signs for ten Units and pays what it is given, by bank, against the kept stamped paper. */
const signedAndPaid = async (
  owner: Awaited<ReturnType<typeof as>>,
  name: string,
  amountBdt: number
) => {
  const him = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone: `0175${suffix}${amountBdt === UNIT_PRICE * 10 ? 1 : 2}`,
  });
  const agreement = await owner.ventures.sign({
    ventureId,
    investorId: him.id,
    units: 10,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2071-01-02",
    stampSerial: `PP ${name} ${suffix}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt,
    movedOn: "2071-01-03",
    paymentMethod: "bank",
    reference: `TRF-${name}-${suffix}`,
  });
  return agreement.id;
};

beforeAll(async () => {
  const owner = await as("owner", "2071-01-02T04:00:00.000Z");
  const shed = await owner.herd.createShed({ name: `শেড ${suffix}` });
  const pen = await owner.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  const venture = await owner.ventures.open({
    name: `আংশিক ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2071-01-20",
    targetWindowStart: "2071-06-01",
    targetWindowEnd: "2071-06-10",
    unitPriceBdt: UNIT_PRICE,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  ventureId = venture.id;
  paidInFull = await signedAndPaid(owner, "পুরো", UNIT_PRICE * 10);
  // Six of his ten Units paid for when the buying starts.
  partPaid = await signedAndPaid(owner, "আংশিক", UNIT_PRICE * 6);
  await owner.ventures.startBuying({ id: ventureId });

  // One bull for a hundred thousand and nothing sold: a loss of a hundred thousand, sixty of it the Investors'.
  const buying = await as("owner", "2071-01-04T04:00:00.000Z");
  const trip = await buying.trips.record({
    wentTo: `হাট ${suffix}`,
    wentOn: "2071-01-04",
    brokerBdt: 0,
    transportBdt: 0,
    keepBdt: 0,
  });
  await buying.ventures.drawFloat({
    ventureId,
    buyingTripId: trip.id,
    amountBdt: 100_000,
    movedOn: "2071-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const manager = await as("manager", "2071-01-04T05:00:00.000Z");
  await manager.intake.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 100_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    buyingTripId: trip.id,
    ventureId,
    arrivedAt: new Date("2071-01-04T05:00:00.000Z"),
    targetWindowStart: "2071-06-01",
    targetWindowEnd: "2071-06-10",
  });
});

describe("a Settlement with an Agreement only part paid", () => {
  it("shares the loss by the Units paid for, not by the Units signed for", async () => {
    const owner = await as("owner", "2071-01-10T04:00:00.000Z");

    const settlement = await owner.ventures.settlement({ ventureId });

    const full = settlement.payouts.find(
      (one) => one.agreementId === paidInFull
    );
    const part = settlement.payouts.find((one) => one.agreementId === partPaid);
    expect(settlement.profitBdt).toBe(-100_000);
    // Ten Units and six paid for: sixteen take the Investors' sixty thousand of it, 3,750 each.
    expect(settlement.units).toBe(16);
    expect(full).toMatchObject({
      units: 10,
      capitalBdt: 500_000,
      shareBdt: -37_500,
    });
    expect(part).toMatchObject({
      units: 6,
      capitalBdt: 300_000,
      shareBdt: -22_500,
      payoutBdt: 277_500,
    });
  });

  it("loses nothing for the man who paid in full on account of the one who did not", async () => {
    const owner = await as("owner", "2071-01-10T04:00:00.000Z");

    const settlement = await owner.ventures.settlement({ ventureId });

    // Per taka put in, both carry the same loss.
    const perTaka = settlement.payouts.map(
      (one) => one.shareBdt / one.capitalBdt
    );
    expect(new Set(perTaka).size).toBe(1);
  });
});

import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Venture may start buying while an Agreement is only part paid: the Floor is the only thing it asks — and a farm may
// take only the cattle money first, the running money to come by the month. Capital comes back as it was paid; the
// share of a profit or a loss must divide the same way, to the taka, or a man takes a share of the run for money he
// never put in, and everybody who did pay is diluted by it.

const suffix = `${Date.now()}`.slice(-7);
const UNIT_PRICE = 50_000;
/** The cattle money of one Unit, paid before the buying; the other ten thousand would come by the month. */
const CATTLE_PART = 40_000;

const as = async (role: "owner" | "manager", at: string) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
  });
  return client;
};

let ventureId = "";
let tenUnits = "";
let threeUnits = "";

let phones = 0;

/** Signs for so many Units and pays what it is given, by bank, against the kept stamped paper. */
const signedAndPaid = async (
  owner: Awaited<ReturnType<typeof as>>,
  name: string,
  units: number,
  amountBdt: number
) => {
  phones += 1;
  const him = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone: `0175${suffix}${phones}`,
  });
  const agreement = await owner.ventures.sign({
    ventureId,
    investorId: him.id,
    units,
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
  // Each pays the cattle money of his Units and no more when the buying starts.
  tenUnits = await signedAndPaid(owner, "দশ", 10, CATTLE_PART * 10);
  threeUnits = await signedAndPaid(owner, "তিন", 3, CATTLE_PART * 3);
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

describe("a Settlement with Agreements only part paid", () => {
  it("divides by the Units each holds — what it paid over the Unit price — not the Units signed for", async () => {
    const owner = await as("owner", "2071-01-10T04:00:00.000Z");

    const settlement = await owner.ventures.settlement({ ventureId });

    const ten = settlement.payouts.find((one) => one.agreementId === tenUnits);
    const three = settlement.payouts.find(
      (one) => one.agreementId === threeUnits
    );
    expect(settlement.profitBdt).toBe(-100_000);
    // Four lakh is eight Units' worth and 1,20,000 is 2.4 — not two, and not the three he signed for.
    expect(ten?.units).toBe(8);
    expect(three?.units).toBe(2.4);
    expect(settlement.units).toBe(10.4);
    // The Investors' sixty thousand of the loss over 10.4 Units: 5,770 a Unit, floored like every figure per Unit.
    expect(settlement.perUnitBdt).toBe(-5770);
    expect(ten).toMatchObject({ shareBdt: -46_160, payoutBdt: 353_840 });
    expect(three).toMatchObject({ shareBdt: -13_848, payoutBdt: 106_152 });
  });

  it("loses no more per taka for the man with more Units than for the man with fewer", async () => {
    const owner = await as("owner", "2071-01-10T04:00:00.000Z");

    const settlement = await owner.ventures.settlement({ ventureId });

    // Per taka put in, both carry the same loss.
    const perTaka = settlement.payouts.map(
      (one) => one.shareBdt / one.capitalBdt
    );
    expect(new Set(perTaka).size).toBe(1);
  });
});

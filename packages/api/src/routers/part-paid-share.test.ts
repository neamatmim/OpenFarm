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
  amountMoney: number
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
    stampValueMoney: 300,
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
    amountMoney,
    movedOn: "2071-01-03",
    paymentMethod: "bank",
    reference: `TRF-${name}-${suffix}`,
  });
  return agreement.id;
};

beforeAll(async () => {
  const owner = await as("owner", "2071-01-02T04:00:00.000Z");
  const shed = await owner.sheds.createShed({ name: `শেড ${suffix}` });
  const pen = await owner.sheds.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  const venture = await owner.ventures.open({
    name: `আংশিক ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2071-01-20",
    targetWindowStart: "2071-06-01",
    targetWindowEnd: "2071-06-10",
    unitPriceMoney: UNIT_PRICE,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  ventureId = venture.id;
  // Each pays the cattle money of his Units and no more when the buying starts.
  tenUnits = await signedAndPaid(owner, "দশ", 10, CATTLE_PART * 10);
  threeUnits = await signedAndPaid(owner, "তিন", 3, CATTLE_PART * 3);
  await owner.ventures.startBuying({ id: ventureId });

  // One bull for a hundred thousand and nothing sold: a loss of a hundred thousand, sixty of it the Investors'.
  const buying = await as("owner", "2071-01-04T04:00:00.000Z");
  const trip = await buying.buyingTrips.record({
    wentTo: `হাট ${suffix}`,
    wentOn: "2071-01-04",
    brokerMoney: 0,
    transportMoney: 0,
    keepMoney: 0,
  });
  await buying.ventures.drawFloat({
    ventureId,
    buyingTripId: trip.id,
    amountMoney: 100_000,
    movedOn: "2071-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const manager = await as("manager", "2071-01-04T05:00:00.000Z");
  await manager.intakes.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 100_000,
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
    expect(settlement.profitMoney).toBe(-100_000);
    // Four lakh is eight Units' worth and 1,20,000 is 2.4 — not two, and not the three he signed for.
    expect(ten?.units).toBe(8);
    expect(three?.units).toBe(2.4);
    expect(settlement.units).toBe(10.4);
    // The Investors' sixty thousand of the loss over 10.4 Units: 5,770 a Unit, floored like every figure per Unit.
    expect(settlement.perUnitMoney).toBe(-5770);
    expect(ten).toMatchObject({ shareMoney: -46_160, payoutMoney: 353_840 });
    expect(three).toMatchObject({ shareMoney: -13_848, payoutMoney: 106_152 });
  });

  it("loses no more per taka for the man with more Units than for the man with fewer", async () => {
    const owner = await as("owner", "2071-01-10T04:00:00.000Z");

    const settlement = await owner.ventures.settlement({ ventureId });

    // Per taka put in, both carry the same loss.
    const perMoney = settlement.payouts.map(
      (one) => one.shareMoney / one.capitalMoney
    );
    expect(new Set(perMoney).size).toBe(1);
  });
});

describe("the progress paper of a part-paid Venture", () => {
  it("says the Units each holds and his share of all held, as the Settlement will divide", async () => {
    const owner = await as("owner", "2071-02-01T04:00:00.000Z");
    await owner.farm.setIdentity({
      address: `সাভার ${suffix}`,
      phone: "+8801711000094",
      registrationNumber: `DLS/SAV/2071/${suffix}`,
      registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
      registrationExpiresOn: "2073-03-31",
    });
    const venture = await owner.ventures.open({
      name: `অগ্রগতি ${suffix}`,
      targetCapitalMoney: 1_000_000,
      floorMoney: 0,
      decideBy: "2071-02-20",
      targetWindowStart: "2071-07-01",
      targetWindowEnd: "2071-07-10",
      unitPriceMoney: UNIT_PRICE,
      units: 20,
      cattleBudgetMoney: 800_000,
    });
    ventureId = venture.id;
    const full = await signedAndPaid(owner, "পূর্ণ", 10, UNIT_PRICE * 10);
    const part = await signedAndPaid(owner, "ছয়", 10, UNIT_PRICE * 6);
    await owner.ventures.startBuying({ id: venture.id });

    // Read as the farm stands now, registered, which the client opened before that was not.
    const reader = await as("owner", "2071-02-02T04:00:00.000Z");
    const paperOf = async (agreementId: string) => {
      const paper = await reader.investorStatements.progress({ agreementId });
      return paper.text;
    };

    // Ten Units and six held of sixteen: 63% and 38% — not the half each their signatures would say.
    expect(await paperOf(full)).toContain("১০ (৬৩%)");
    expect(await paperOf(part)).toContain("৬ (৩৮%)");
  });
});

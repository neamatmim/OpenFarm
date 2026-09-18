import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A settled Venture refuses the Corrections that name one of its Animals.
 *
 * Its figures were frozen at approval and every Investor was paid on them, so putting one of its records
 * right afterwards would move what the costing says while the Settlement stood still. A Sale is the one
 * exception: it is the late news itself, and refusing it would leave what a buyer really paid nowhere
 * to land.
 */
const suffix = `settled-${Date.now()}`;

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 500_000,
  floorBdt: 0,
  decideBy: "2048-01-20",
  targetWindowStart: "2048-02-17",
  targetWindowEnd: "2048-02-19",
  unitPriceBdt: 50_000,
  units: 10,
  cattleBudgetBdt: 400_000,
};

/** The round that starts the health chain: somebody walks the pen and says what they saw. */
const healthWalkSop = (): SopContent => ({
  name: { bn: `স্বাস্থ্য পরিদর্শন ${suffix}` },
  purpose: { bn: "প্রতিটি পশু দেখে যা চোখে পড়ে তা লিখুন" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 180,
  steps: [
    {
      id: "look",
      text: { bn: "পশুটিকে দেখুন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: [
            { value: "well", label: { bn: "সুস্থ" } },
            { value: "sick", label: { bn: "অসুস্থ" } },
          ],
        },
      ],
      skipReasons: [{ bn: "পশু পাওয়া যায়নি" }],
      effect: { kind: "observation" },
    },
  ],
});

type Owner = Awaited<ReturnType<typeof as>>;

let ventureId = "";
let penId = "";
let soldTag = "";
let deadTag = "";
let tripId = "";
let saleId = "";
let diagnosisId = "";

const theVenture = async (owner: Owner) => {
  const ventures = await owner.client.ventures.list();
  return ventures.find((one) => one.id === ventureId);
};

beforeAll(async () => {
  const owner = await as("owner", "2048-01-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;

  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    ...plan,
  });
  ventureId = venture.id;
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${suffix}`,
    phone: "01955555555",
  });
  const agreement = await owner.client.ventures.sign({
    ventureId,
    investorId: person.id,
    units: 10,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2048-01-02",
    stampSerial: `AA ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 500_000,
    movedOn: "2048-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.client.ventures.startBuying({ id: ventureId });

  // Two bulls on the Venture's own Float. Nothing is ever fed to them, so no month owes a
  // Reimbursement and the Settlement turns only on what they fetched.
  const buying = await as("owner", "2048-01-04T04:00:00.000Z");
  const trip = await buying.client.trips.record({
    wentTo: `হাট ${suffix}`,
    wentOn: "2048-01-04",
    brokerBdt: 0,
    transportBdt: 0,
    keepBdt: 0,
  });
  await buying.client.ventures.drawFloat({
    ventureId,
    buyingTripId: trip.id,
    amountBdt: 200_000,
    movedOn: "2048-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const manager = await as("manager", "2048-01-04T05:00:00.000Z");
  const broughtIn = async () => {
    const her = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 100_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      buyingTripId: trip.id,
      ventureId,
      arrivedAt: new Date("2048-01-04T05:00:00.000Z"),
      targetWindowStart: plan.targetWindowStart,
      targetWindowEnd: plan.targetWindowEnd,
    });
    return her.tagNumber;
  };
  soldTag = await broughtIn();
  deadTag = await broughtIn();
  await buying.client.ventures.reconcileFloat({
    buyingTripId: trip.id,
    cashBackBdt: 0,
    movedOn: "2048-01-04",
    reference: `DEP-${suffix}`,
  });

  // Somebody walks the pen and finds one of them off colour; the Vet says what it is; she dies of it.
  // A dead Animal is gone, so the Venture may still settle.
  const sop = await owner.client.sops.create({ content: healthWalkSop() });
  const walking = await as("manager", "2048-01-10T07:30:00.000Z");
  await walking.client.instances.ensureDue();
  const today = await walking.client.instances.today({ penId });
  const walk = today.find((one) => one.definitionId === sop.definitionId);
  await walking.client.instances.claim({ id: walk?.id ?? "" });
  await walking.client.instances.completeStep({
    instanceId: walk?.id ?? "",
    stepId: "look",
    animalTag: deadTag,
    evidence: ["sick"],
  });
  const page = await walking.client.animals.byTag({ tagNumber: deadTag });
  const seen = page.observations.at(0);
  const vet = await as("vet", "2048-01-10T09:00:00.000Z");
  const said = await vet.client.diagnoses.record({
    animalTag: deadTag,
    answers: seen?.id ?? "",
    disease: { bn: `জ্বর ${suffix}` },
    note: `হাটে থাকতেই ধরেছে ${suffix}`,
  });
  diagnosisId = said.id;
  const losing = await as("manager", "2048-01-12T05:00:00.000Z");
  await losing.client.animals.recordMortality({
    tagNumber: deadTag,
    kind: "died",
    cause: `জ্বরে মারা গেছে ${suffix}`,
    disposal: "buried",
  });

  // The other goes to the haat on a Selling Trip and is sold there.
  const selling = await as("manager", "2048-02-18T05:00:00.000Z");
  const outing = await selling.client.sellingTrips.record({
    wentTo: `বিক্রির হাট ${suffix}`,
    transportBdt: 4000,
    keepBdt: 0,
    animals: [soldTag],
    paymentMethod: "cash",
  });
  tripId = outing.id;
  const sold = await selling.client.sale.record({
    tagNumber: soldTag,
    buyer: { name: `ক্রেতা ${suffix}` },
    priceBdt: 300_000,
    weightKg: 320,
    destination: `ঢাকা ${suffix}`,
    vehicle: `ঢাকা মেট্রো ${suffix}`,
    driver: `চালক ${suffix}`,
    paymentMethod: "bank",
  });
  saleId = sold.id;

  // Both months read against the bank, and the Settlement approved and paid out.
  const reading = await as("owner", "2048-03-01T04:00:00.000Z");
  await reading.client.ventures.checkTheBank({
    ventureId,
    month: "2048-01",
    readBdt: 300_000,
  });
  await reading.client.ventures.checkTheBank({
    ventureId,
    month: "2048-02",
    readBdt: 600_000,
  });
  const settling = await as("owner", "2048-03-02T04:00:00.000Z");
  await settling.client.ventures.approveSettlement({ ventureId });
  const approved = await settling.client.ventures.approvedSettlement({
    ventureId,
  });
  for (const his of approved?.shares ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor at a time
    await settling.client.ventures.paySettlement({
      ventureId,
      agreementId: his.agreementId,
      amountBdt: his.payoutBdt,
      movedOn: "2048-03-02",
      paymentMethod: "bank",
      reference: `PAY-${suffix}`,
    });
  }
  if ((approved?.farmBdt ?? 0) > 0) {
    await settling.client.ventures.takeTheFarmsShare({
      ventureId,
      movedOn: "2048-03-02",
      paymentMethod: "bank",
      reference: `FARM-${suffix}`,
    });
  }
});

describe("a settled Venture's records", () => {
  it("is settled to begin with", async () => {
    const owner = await as("owner", "2048-03-03T04:00:00.000Z");
    const venture = await theVenture(owner);
    expect(venture?.state).toBe("settled");
  });

  it("refuses a Diagnosis of one of its Animals put right", async () => {
    const vet = await as("vet", "2048-03-03T05:00:00.000Z");
    await expect(
      vet.client.diagnoses.correct({
        id: diagnosisId,
        reason: `অন্য রোগ ছিল ${suffix}`,
        changes: {
          disease: {
            from: `জ্বর ${suffix}`,
            to: { bn: `অন্য ${suffix}` },
          },
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_is_settled" },
    });
  });

  it("refuses how one of its Animals left put right", async () => {
    const manager = await as("manager", "2048-03-03T06:00:00.000Z");
    await expect(
      manager.client.animals.correctMortality({
        tagNumber: deadTag,
        reason: `কারণ ভুল লেখা ছিল ${suffix}`,
        changes: {
          cause: {
            from: `জ্বরে মারা গেছে ${suffix}`,
            to: `অন্য কারণে ${suffix}`,
          },
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_is_settled" },
    });
  });

  it("refuses an outing that carried one of its Animals put right", async () => {
    const manager = await as("manager", "2048-03-03T07:00:00.000Z");
    // The lorry's costs are split across the Animals it carried, so they are charges against whichever
    // Venture had one on it.
    await expect(
      manager.client.sellingTrips.correct({
        id: tripId,
        reason: `ভাড়া বেশি ছিল ${suffix}`,
        changes: { transportBdt: { from: 4000, to: 6000 } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_is_settled" },
    });
  });

  it("lets a Sale be put right, because that is the late news itself", async () => {
    const owner = await as("owner", "2048-03-03T08:00:00.000Z");
    await owner.client.sale.correct({
      id: saleId,
      reason: `ক্রেতা বাকিটা দিয়েছে ${suffix}`,
      changes: { priceBdt: { from: 300_000, to: 320_000 } },
    });
    // And the Settlement it was approved on has not moved a taka for it.
    const after = await owner.client.ventures.approvedSettlement({ ventureId });
    expect(after?.proceedsBdt).toBe(300_000);
  });

  it("refuses a record from its time even once she belongs to somebody else", async () => {
    // A second Venture takes one of its bulls on before it settles, so today she is that Venture's.
    // A Diagnosis from the settled one's time still moves what the settled one was worked out on, and
    // reading only who owns her now would let it through under the new owner's name.
    const owner = await as("owner", "2048-03-04T04:00:00.000Z");
    const next = await owner.client.ventures.open({
      name: `পরের ভেঞ্চার ${suffix}`,
      ...plan,
      decideBy: "2048-03-20",
      targetWindowStart: "2048-06-17",
      targetWindowEnd: "2048-06-19",
    });
    const person = await owner.client.investors.record({
      name: `দ্বিতীয় বিনিয়োগকারী ${suffix}`,
      phone: "01966666666",
    });
    const paper = await owner.client.ventures.sign({
      ventureId: next.id,
      investorId: person.id,
      units: 10,
      investorsPercent: 60,
      arbitrator: `মাওলানা ${suffix}`,
      stampValueBdt: 300,
      stampedOn: "2048-03-04",
      stampSerial: `BB ${suffix}`,
    });
    await owner.client.ventures.keepAgreementPaper({
      agreementId: paper.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    await owner.client.ventures.takeCapital({
      agreementId: paper.id,
      amountBdt: 500_000,
      movedOn: "2048-03-04",
      paymentMethod: "bank",
      reference: `TRF2-${suffix}`,
    });
    await owner.client.ventures.startBuying({ id: next.id });

    // She is the new Venture's now — and the old one's Diagnosis is still refused.
    const vet = await as("vet", "2048-03-05T05:00:00.000Z");
    await expect(
      vet.client.diagnoses.correct({
        id: diagnosisId,
        reason: `অন্য রোগ ছিল ${suffix}`,
        changes: {
          disease: { from: `জ্বর ${suffix}`, to: { bn: `আবার ${suffix}` } },
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_is_settled" },
    });
  });
});

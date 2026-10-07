import { animalMove } from "@OpenFarm/db/schema/herd";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A record entered twice — the Owner and the Manager both wrote up the bill, a Save tapped again on a weak signal — can
// be taken back: voided by whoever may correct it in their window, the Owner at any time, its money with it, the trail
// keeping what it said (the Owner, 2026-10-07). Before, every amount had to stay above nothing and only a Sale, a death
// and a Receivable Payment had a void, so the phantom lorry, bill or dispatch stood for good.

const suffix = `${Date.now()}`;
const NOW = "2093-04-10T04:00:00.000Z";

const as = (role: "owner" | "manager" | "vet", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const VOID = { voided: { from: false, to: true as const } };
const WHY = "দুবার লেখা হয়েছিল";

let quarantinePenId = "";
let dairyPenId = "";

beforeAll(async () => {
  const owner = await as("owner");
  const shed = await owner.client.sheds.create({ name: `twice-${suffix}` });
  const quarantine = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `কোয়ারেন্টিন ${suffix}`,
  });
  quarantinePenId = quarantine.id;
  const dairy = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `গাভী ${suffix}`,
  });
  dairyPenId = dairy.id;
});

describe("money entered by hand, twice", () => {
  it("is voided, its Money Event gone, and the trail keeps what it said", async () => {
    const manager = await as("manager");
    const categories = await manager.client.money.categories.list();
    const utilities = categories.find((one) => one.key === "utilities");
    const bill = {
      categoryId: utilities?.id ?? "",
      amountMoney: 4200,
      occurredOn: "2093-04-09",
      counterparty: { name: `পল্লী বিদ্যুৎ ${suffix}` },
      paymentMethod: "cash" as const,
      note: `বিদ্যুৎ বিল ${suffix}`,
    };
    await manager.client.money.enter(bill);
    // The farm asked whether it was the same bill again, and was told yes: the slip the void is for.
    const second = await manager.client.money.enter({
      ...bill,
      sameAgain: true,
    });

    await manager.client.money.correctEntered({
      id: second.id,
      reason: WHY,
      changes: VOID,
    });

    const left = await scratchDb().query.moneyEvent.findMany({
      where: { farmId: theFarm().id, note: bill.note },
      columns: { id: true },
    });
    expect(left).toHaveLength(1);
    const trail = await scratchDb().query.auditEvent.findFirst({
      where: { entity: "money_event", entityId: second.id, reason: WHY },
      columns: { before: true },
    });
    expect(trail?.before).toMatchObject({ amountMoney: 4200 });
  });
});

describe("a feed lorry entered twice", () => {
  it("is voided, and the store holds one lorry's feed", async () => {
    const manager = await as("manager");
    const item = await manager.client.feed.items.create({
      name: { bn: `খড় ${suffix}` },
    });
    const lorry = {
      feedItemId: item.id,
      kind: "purchase" as const,
      quantity: 1000,
      priceMoney: 8000,
      seller: { name: `খড়ের ব্যাপারী ${suffix}` },
      receivedOn: "2093-04-09",
    };
    await manager.client.stock.receive(lorry);
    const second = await manager.client.stock.receive(lorry);

    await manager.client.stock.correct({
      id: second.id,
      reason: WHY,
      changes: VOID,
    });

    const onHand = await manager.client.stock.onHand();
    const line = onHand.find((one) => one.feedItemId === item.id) as
      | Record<string, unknown>
      | undefined;
    expect(JSON.stringify(line)).toContain("1000");
    expect(JSON.stringify(line)).not.toContain("2000");
    const money = await scratchDb().query.moneyEvent.findMany({
      where: { source: "feed_in", sourceId: second.id },
      columns: { id: true },
    });
    expect(money).toEqual([]);
  });
});

describe("a Medicine Purchase entered twice", () => {
  it("is voided with its money", async () => {
    const vet = await as("vet");
    const product = await vet.client.drugs.create({
      name: { bn: `ভিটামিন ${suffix}` },
      milkWithdrawalDays: 0,
      meatWithdrawalDays: 0,
    });
    const manager = await as("manager");
    const bought = {
      drugProductId: product.id,
      quantity: "২০ ডোজ",
      doses: 20,
      priceMoney: 2000,
      seller: { name: `ওষুধের দোকান ${suffix}` },
      purchasedOn: "2093-04-09",
      paymentMethod: "cash" as const,
    };
    await manager.client.drugs.purchase(bought);
    const second = await manager.client.drugs.purchase(bought);

    await manager.client.drugs.correctPurchase({
      id: second.id,
      reason: WHY,
      changes: VOID,
    });

    const purchases = await scratchDb().query.medicinePurchase.findMany({
      where: { farmId: theFarm().id, drugProductId: product.id },
      columns: { id: true },
    });
    expect(purchases).toHaveLength(1);
  });
});

describe("a milk Dispatch entered twice", () => {
  it("is voided, and the buyer owes for one lorry", async () => {
    const manager = await as("manager");
    const lorry = {
      dispatchedAt: new Date("2093-04-09T02:00:00.000Z"),
      litres: 100,
      buyer: { name: `মিল্ক ভিটা ${suffix}` },
      pricePerLitreMoney: 50,
      paymentMethod: "bank" as const,
    };
    await manager.client.milk.dispatch(lorry);
    await manager.client.milk.dispatch(lorry);
    const both = await scratchDb().query.dispatch.findMany({
      where: { farmId: theFarm().id, buyerName: lorry.buyer.name },
      columns: { id: true },
      orderBy: { recordedAt: "asc", id: "asc" },
    });

    await manager.client.milk.correctDispatch({
      id: both[1]?.id ?? "",
      reason: WHY,
      changes: VOID,
    });

    const left = await scratchDb().query.dispatch.findMany({
      where: { farmId: theFarm().id, buyerName: lorry.buyer.name },
      columns: { id: true },
    });
    expect(left.map((one) => one.id)).toEqual([both[0]?.id]);
  });
});

const intakeOf = async (tagNumber: string) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber },
    columns: { id: true },
  });
  const row = await scratchDb().query.intake.findFirst({
    where: { animalId: her?.id ?? "" },
    columns: { id: true },
  });
  return row?.id ?? "";
};

describe("an animal bought in and written up twice", () => {
  const boughtIn = async () => {
    const manager = await as("manager");
    return manager.client.intakes.record({
      penId: quarantinePenId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 90_000,
      weightKg: 200,
      estimatedAgeMonths: 24,
    });
  };

  it("is voided: she is gone from the herd, her Intake and its money with her", async () => {
    const ghost = await boughtIn();
    const intakeId = await intakeOf(ghost.tagNumber);
    const manager = await as("manager");

    await manager.client.intakes.correct({
      id: intakeId,
      reason: WHY,
      changes: VOID,
    });

    const gone = await scratchDb().query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber: ghost.tagNumber },
      columns: { id: true },
    });
    expect(gone).toBeUndefined();
    const money = await scratchDb().query.moneyEvent.findMany({
      where: { source: "intake", sourceId: intakeId },
      columns: { id: true },
    });
    expect(money).toEqual([]);
  });

  it("once something has been written about her, is refused: she is a real animal", async () => {
    const real = await boughtIn();
    const intakeId = await intakeOf(real.tagNumber);
    const her = await scratchDb().query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber: real.tagNumber },
      columns: { id: true },
    });
    // Walked to another Pen since she came: the farm has built on her.
    await scratchDb()
      .insert(animalMove)
      .values({
        id: `moved-${real.tagNumber}-${suffix}`,
        farmId: theFarm().id,
        animalId: her?.id ?? "",
        fromPenId: quarantinePenId,
        toPenId: quarantinePenId,
        toSide: "fattening",
        reason: "walked",
        movedBy: thePerson("manager").id,
        movedAt: new Date(NOW),
      });
    const manager = await as("manager");

    await expect(
      manager.client.intakes.correct({
        id: intakeId,
        reason: WHY,
        changes: VOID,
      })
    ).rejects.toMatchObject({ data: { refusal: "she_is_built_on" } });
  });
});

describe("a calf registered twice", () => {
  it("is voided by whoever registered her", async () => {
    const manager = await as("manager");
    const calf = {
      sex: "female" as const,
      side: "dairy" as const,
      state: "calf" as const,
      penId: dairyPenId,
      source: "born" as const,
      aliases: [],
    };
    const twice = await manager.client.animals.register(calf);

    await manager.client.animals.correctRegistration({
      tagNumber: twice.tagNumber,
      reason: WHY,
      changes: VOID,
    });

    const gone = await scratchDb().query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber: twice.tagNumber },
      columns: { id: true },
    });
    expect(gone).toBeUndefined();
  });
});

const paid = (agreementId: string, reference: string) => ({
  agreementId,
  amountMoney: 100_000,
  movedOn: "2093-04-05",
  paymentMethod: "bank" as const,
  reference,
});

describe("an Investor's capital payment written twice", () => {
  /** A Venture with one Investor signed for four Units, his paper on file, and nothing paid yet. */
  const signedFor = async (label: string) => {
    const owner = await as("owner");
    const venture = await owner.client.ventures.open({
      name: `দুবার ${label} ${suffix}`,
      targetCapitalMoney: 400_000,
      floorMoney: 0,
      decideBy: "2093-05-01",
      targetWindowStart: "2093-09-01",
      targetWindowEnd: "2093-09-10",
      unitPriceMoney: 50_000,
      units: 8,
      cattleBudgetMoney: 300_000,
    });
    const person = await owner.client.investors.record({
      name: `বিনিয়োগকারী ${label} ${suffix}`,
      phone: `0191${String(Date.now()).slice(-7)}`,
    });
    const agreement = await owner.client.ventures.agreements.sign({
      ventureId: venture.id,
      investorId: person.id,
      units: 4,
      investorsPercent: 60,
      arbitrator: `সালিস ${label} ${suffix}`,
      stampValueMoney: 300,
      stampedOn: "2093-04-01",
      stampSerial: `AA ${label} ${suffix}`,
    });
    await owner.client.ventures.agreements.keepPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    return { owner, ventureId: venture.id, agreementId: agreement.id };
  };

  it("is refused when the same transfer is taken twice", async () => {
    const { owner, agreementId } = await signedFor("ref");
    await owner.client.ventures.takeCapital(paid(agreementId, "TRF-777"));

    await expect(
      owner.client.ventures.takeCapital(paid(agreementId, " trf-777 "))
    ).rejects.toMatchObject({ data: { refusal: "capital_reference_taken" } });
  });

  it("is voided by the Owner, and his paper owes what it did before", async () => {
    const { owner, ventureId, agreementId } = await signedFor("void");
    await owner.client.ventures.takeCapital(paid(agreementId, "TRF-1"));
    // Typed under another reference the second time, so the farm could not tell.
    await owner.client.ventures.takeCapital(paid(agreementId, "TRF-1 again"));
    const both = await scratchDb().query.ventureMovement.findMany({
      where: { farmId: theFarm().id, ventureId, kind: "capital_in" },
      columns: { id: true, reference: true },
    });
    const twice = both.find((one) => one.reference === "TRF-1 again");

    await owner.client.ventures.movements.correct({
      id: twice?.id ?? "",
      reason: WHY,
      changes: VOID,
    });

    const left = await scratchDb().query.ventureMovement.findMany({
      where: { farmId: theFarm().id, ventureId, kind: "capital_in" },
      columns: { reference: true, amountMoney: true },
    });
    expect(left).toEqual([{ reference: "TRF-1", amountMoney: 100_000 }]);
  });

  it("before capital is taken on it, its Units are put right against the stamped paper; after, they stand", async () => {
    const { owner, agreementId } = await signedFor("typo");

    await owner.client.ventures.agreements.correct({
      id: agreementId,
      reason: "কাগজে ছয় ইউনিট",
      changes: { units: { from: 4, to: 6 } },
    });
    const put = await scratchDb().query.investmentAgreement.findFirst({
      where: { id: agreementId },
      columns: { units: true },
    });
    expect(put?.units).toBe(6);

    await owner.client.ventures.takeCapital(paid(agreementId, "TRF-TYPO"));
    await expect(
      owner.client.ventures.agreements.correct({
        id: agreementId,
        reason: "আবার",
        changes: { units: { from: 6, to: 5 } },
      })
    ).rejects.toMatchObject({ data: { refusal: "capital_taken_on_it" } });
  });
});

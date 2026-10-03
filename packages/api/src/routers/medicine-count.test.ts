import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The monthly medicine count: every product on the Drug List counted in doses, blind, on the first Friday of the
// month; the count wins, and a shortfall past the Owner's line — at what the doses cost — is told to the Owner.

const suffix = `medicine-count-${Date.now()}`;

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** Half past ten on a Friday morning at the farm. */
const fridayMorning = (day: string) => `${day}T04:30:00.000Z`;

let countId = "";
let oxy = "";
let dewormer = "";

beforeAll(async () => {
  const owner = await as("owner", "2084-02-01T04:00:00.000Z");
  const made = await owner.client.sops.create({
    content: standardPlaybook().medicineCount,
  });
  countId = made.definitionId;
  // Work about the whole farm is raised while any Pen holds an animal.
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `গাভী পেন ${suffix}`,
  });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  const vet = await as("vet", "2084-02-01T04:00:00.000Z");
  const product = await vet.client.drugs.create({
    name: { bn: `অক্সিটেট্রাসাইক্লিন ${suffix}` },
    milkWithdrawalDays: 4,
    meatWithdrawalDays: 21,
  });
  oxy = product.id;
  const worms = await vet.client.drugs.create({
    name: { bn: `কৃমিনাশক ${suffix}` },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 14,
  });
  dewormer = worms.id;
  const manager = await as("manager", "2084-02-02T04:00:00.000Z");
  // Ten doses at ৳100 a dose, and five at ৳100.
  for (const [drugProductId, doses, priceMoney] of [
    [oxy, 10, 1000],
    [dewormer, 5, 500],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one box after the other off the shelf
    await manager.client.drugs.purchase({
      drugProductId,
      quantity: `${doses} ডোজ`,
      doses,
      priceMoney,
      seller: { name: `ওষুধের দোকান ${suffix}` },
      purchasedOn: "2084-02-02",
      paymentMethod: "cash",
    });
  }
  // One dose of the oxytetracycline given: nine left in the book.
  const later = await as("manager", "2084-02-10T05:00:00.000Z");
  await later.client.treatments.giveNotPrescribed({
    animalTag: cow.tagNumber,
    productId: oxy,
    givenAt: new Date("2084-02-10T04:00:00.000Z"),
    advice: `জ্বর ${suffix}`,
  });
});

/** The count's work on a Friday morning, claimed by the Manager — or nothing, where none was raised. */
const theCount = async (day: string) => {
  const manager = await as("manager", fridayMorning(day));
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today();
  const work = today.find((row) => row.definitionId === countId);
  return { manager, work };
};

const count = async (
  day: string,
  medicineCounts: { drugProductId: string; counted: number; reason?: string }[]
) => {
  const { manager, work } = await theCount(day);
  if (!work) {
    throw new Error("expected the monthly medicine count");
  }
  await manager.client.work.claim({ id: work.id });
  return await manager.client.work.completeStep({
    instanceId: work.id,
    stepId: "count",
    evidence: [true],
    medicineCounts,
  });
};

const onHandOf = async (productId: string) => {
  const owner = await as("owner", "2084-05-01T04:00:00.000Z");
  const drugs = await owner.client.drugs.list();
  return drugs.find((one) => one.id === productId)?.stock.onHand;
};

describe("the monthly medicine count", () => {
  it("is raised on the first Friday of the month, blind, and every medicine is counted", async () => {
    const { manager, work } = await theCount("2084-03-03");
    expect(work).toBeDefined();
    const shown = await manager.client.work.get({ id: work?.id ?? "" });
    expect(shown.medicineCount?.items.map((one) => one.drugProductId)).toEqual(
      expect.arrayContaining([oxy, dewormer])
    );
    // Nothing of what the book says is handed to the phone.
    expect(JSON.stringify(shown.medicineCount)).not.toContain("expected");
    await expect(
      count("2084-03-03", [{ drugProductId: oxy, counted: 9 }])
    ).rejects.toMatchObject({
      data: { refusal: "medicine_count_incomplete" },
    });
    await expect(
      count("2084-03-03", [
        { drugProductId: oxy, counted: 7 },
        { drugProductId: dewormer, counted: 5 },
      ])
    ).rejects.toMatchObject({ data: { refusal: "difference_needs_reason" } });
  });

  it("changes nothing where it agrees with the book", async () => {
    const done = await count("2084-03-03", [
      { drugProductId: oxy, counted: 9 },
      { drugProductId: dewormer, counted: 5 },
    ]);
    expect(done.effect).toEqual({ kind: "medicine_count", adjustments: [] });
    expect(await onHandOf(oxy)).toBe(9);
  });

  it("is not raised on the second Friday", async () => {
    const { work } = await theCount("2084-03-10");
    expect(work).toBeUndefined();
  });

  it("wins, and tells the Owner of a shortfall past the line, at what the doses cost", async () => {
    const owner = await as("owner", "2084-04-01T04:00:00.000Z");
    await owner.client.farm.setParameters({ medicineShortTellMoney: 300 });
    const done = await count("2084-04-07", [
      { drugProductId: oxy, counted: 5, reason: `চারটি ডোজ পাওয়া যায়নি ${suffix}` },
      { drugProductId: dewormer, counted: 5 },
    ]);
    expect(done.effect).toEqual({
      kind: "medicine_count",
      adjustments: [{ drugProductId: oxy, difference: -4, perDoseMoney: 100 }],
    });
    expect(await onHandOf(oxy)).toBe(5);
    const told = await scratchDb().query.alert.findMany({
      where: { kind: "medicine_short", userId: thePerson("owner").id },
      columns: { params: true },
    });
    expect(told).toEqual([
      { params: { shortMoney: 400, countedOn: "2084-04-07" } },
    ]);
  });

  it("is the Owner's line to move, not the Manager's", async () => {
    const manager = await as("manager", "2084-04-08T04:00:00.000Z");
    await expect(
      manager.client.farm.setParameters({ medicineShortTellMoney: 50_000 })
    ).rejects.toThrow("Owner");
  });
});

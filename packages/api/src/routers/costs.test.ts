import { and, eq, inArray } from "@OpenFarm/db/operators";
import { animal, penAssignment } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// What an animal costs and what a litre costs: feed charged to the animals that ate it, a dose charged to
// the animal who had it, and from those a fattening animal's margin and a dairy cow's cost per litre.

const suffix = `${Date.now()}`;
const PERIOD = { from: "2039-01-01", to: "2039-01-31" };

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const feedingSop = (): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix}`, en: "Feeding" },
  purpose: { bn: "পেনের পশুদের খাওয়ান" },
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

const milkingSop = (): SopContent => ({
  name: { bn: `দোহন ${suffix}`, en: "Milking" },
  purpose: { bn: "দুধ সংগ্রহ" },
  triggers: [{ kind: "schedule", times: ["05:00"] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 90,
  steps: [
    {
      id: "milk",
      text: { bn: "দোহন করুন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "লিটার" },
          min: 0,
          max: 40,
        },
      ],
      skipReasons: [],
      effect: { kind: "milk_record" },
    },
    {
      id: "bulk",
      text: { bn: "বাল্ক ট্যাংকে মোট" },
      repeatPerAnimal: false,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "লিটার" },
          min: 0,
          max: 5000,
        },
      ],
      skipReasons: [],
      effect: { kind: "bulk_total" },
    },
  ],
});

const campaignSop = (productId: string, name: string): SopContent => ({
  name: { bn: `${name} ${suffix}`, en: name },
  purpose: { bn: "পেনের পশুদের ওষুধ" },
  triggers: [],
  appliesTo: { side: "fattening" },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 240,
  steps: [
    {
      id: "dose",
      text: { bn: "ওষুধ দিন" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "অসুস্থ" }],
      effect: { kind: "treatment", productId },
    },
  ],
});

const setup = async () => {
  const start = "2039-01-01T03:00:00.000Z";
  const owner = await as("owner", start);
  const manager = await as("manager", start);
  const vet = await as("vet", start);
  const shed = await owner.client.herd.createShed({ name: `costs-${suffix}` });
  const fattening = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `খরচ মোটাতাজা ${suffix}`,
  });
  const dairy = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `খরচ দুধ ${suffix}`,
  });
  const empty = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `খরচ খালি ${suffix}`,
  });
  const away = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `খরচ অন্যত্র ${suffix}`,
  });

  // Concentrate bought at 30 a kg; grass cut from the farm's own fields at no price.
  const concentrate = await manager.client.feed.addItem({
    name: { bn: `খরচের দানাদার ${suffix}` },
  });
  const grass = await manager.client.feed.addItem({
    name: { bn: `খরচের ঘাস ${suffix}` },
  });
  await manager.client.stock.receive({
    feedItemId: concentrate.id,
    kind: "purchase",
    quantity: 1000,
    priceBdt: 30_000,
    seller: { name: `দানাদারের দোকান ${suffix}` },
    receivedOn: "2039-01-01",
  });
  await manager.client.stock.receive({
    feedItemId: grass.id,
    kind: "harvest",
    quantity: 1000,
    receivedOn: "2039-01-01",
  });
  const ration = await manager.client.feed.saveRation({
    name: { bn: `খরচের রেশন ${suffix}` },
    items: [
      { feedItemId: concentrate.id, kgPerAnimalPerDay: 5 },
      { feedItemId: grass.id, kgPerAnimalPerDay: 10 },
    ],
  });
  for (const pen of [fattening, dairy, empty]) {
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.feed.assignRation({
      penId: pen.id,
      rationId: ration.rationId,
    });
  }

  // A wormer bought at 1,000 for ten doses: 100 a dose. A tonic nobody has bought.
  const wormer = await vet.client.drugs.add({
    name: { bn: `খরচের কৃমিনাশক ${suffix}` },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 0,
  });
  const tonic = await vet.client.drugs.add({
    name: { bn: `খরচের টনিক ${suffix}` },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 0,
  });
  await manager.client.drugs.purchase({
    drugProductId: wormer.id,
    quantity: "১০ ডোজ",
    doses: 10,
    priceBdt: 1000,
    seller: { name: `ফার্মেসি ${suffix}` },
    purchasedOn: "2039-01-01",
  });

  const sops = {
    feeding: await owner.client.sops.create({ content: feedingSop() }),
    milking: await owner.client.sops.create({ content: milkingSop() }),
    worming: await owner.client.sops.create({
      content: campaignSop(wormer.id, "Worming"),
    }),
    tonic: await owner.client.sops.create({
      content: campaignSop(tonic.id, "Tonic"),
    }),
  };

  await createTestClient(appRouter, { as: "staff" });
  for (const pen of [fattening, dairy, empty]) {
    // oxlint-disable-next-line no-await-in-loop
    await scratchDb()
      .insert(penAssignment)
      .values({
        id: `pa-costs-${pen.id}`,
        farmId: theFarm().id,
        userId: thePerson("staff").id,
        penId: pen.id,
      })
      .onConflictDoNothing();
  }

  const bullA = await manager.client.intake.record({
    penId: fattening.id,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceBdt: 50_000,
    // The haat took its toll on this one; the bull bought later paid none.
    hasilBdt: 1500,
    weightKg: 250,
    estimatedAgeMonths: 20,
    targetWindowStart: "2039-06-01",
    targetWindowEnd: "2039-06-05",
  });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: dairy.id,
    source: "born",
    aliases: [],
  });
  await owner.client.animals.setState({
    tagNumber: cow.tagNumber,
    state: "pregnant_heifer",
  });
  // A heifer who stands in the empty Pen only long enough for its feeding to be raised.
  const heifer = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: empty.id,
    source: "born",
    aliases: [],
  });
  return {
    fattening,
    dairy,
    empty,
    away,
    heifer,
    concentrate,
    grass,
    sops,
    bullA,
    cow,
  };
};

let world: Awaited<ReturnType<typeof setup>>;

/** One piece of this file's work in a Pen, due at this instant. */
const workIn = async (penId: string, definitionId: string, instant: string) => {
  const owner = await as("owner", instant);
  await owner.client.instances.ensureDue();
  const today = await owner.client.instances.today({ penId });
  const work = today.find((row) => row.definitionId === definitionId);
  if (!work) {
    throw new Error("expected the work to be due");
  }
  const staff = await as("staff", instant);
  await staff.client.instances.claim({ id: work.id });
  return { staff, id: work.id };
};

const feed = async (
  penId: string,
  instant: string,
  concentrateKg: number,
  grassKg: number
) => {
  const { staff, id } = await workIn(
    penId,
    world.sops.feeding.definitionId,
    instant
  );
  await staff.client.instances.completeStep({
    instanceId: id,
    stepId: "feed",
    evidence: [true],
    feeding: [
      { feedItemId: world.concentrate.id, givenKg: concentrateKg },
      { feedItemId: world.grass.id, givenKg: grassKg },
    ],
  });
};

const dose = async (
  definitionId: string,
  tagNumber: string,
  instant: string
) => {
  const manager = await as("manager", instant);
  await manager.client.instances.raiseNow({
    definitionId,
    penId: world.fattening.id,
  });
  const today = await manager.client.instances.today({
    penId: world.fattening.id,
  });
  const raised = today.find((row) => row.definitionId === definitionId);
  const staff = await as("staff", instant);
  await staff.client.instances.claim({ id: raised?.id ?? "" });
  await staff.client.instances.completeStep({
    instanceId: raised?.id ?? "",
    stepId: "dose",
    animalTag: tagNumber,
    evidence: [true],
  });
};

let bullB = "";
let soldA = "";

beforeAll(async () => {
  world = await setup();
  // The first morning, bull A stands alone in the Pen and eats alone: 10 kg at 30, and 20 kg of grass.
  await feed(world.fattening.id, "2039-01-02T02:00:00.000Z", 10, 20);
  // The cow eats 20 kg while still an in-calf heifer, then calves that afternoon: her Lactation begins.
  await feed(world.dairy.id, "2039-01-02T02:00:00.000Z", 20, 0);
  const calving = await as("owner", "2039-01-02T12:00:00.000Z");
  await calving.client.animals.setState({
    tagNumber: world.cow.tagNumber,
    state: "milking",
  });
  const manager = await as("manager", "2039-01-02T04:00:00.000Z");
  const taken = await manager.client.intake.record({
    penId: world.fattening.id,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceBdt: 40_000,
    weightKg: 220,
    estimatedAgeMonths: 18,
    targetWindowStart: "2039-06-01",
    targetWindowEnd: "2039-06-05",
  });
  bullB = taken.tagNumber;

  // The cow's morning milking: ten litres to the tank.
  const milking = await workIn(
    world.dairy.id,
    world.sops.milking.definitionId,
    "2039-01-03T00:30:00.000Z"
  );
  await milking.staff.client.instances.completeStep({
    instanceId: milking.id,
    stepId: "milk",
    animalTag: world.cow.tagNumber,
    evidence: [10],
  });
  await milking.staff.client.instances.completeStep({
    instanceId: milking.id,
    stepId: "bulk",
    evidence: [10],
  });
  await milking.staff.client.instances.complete({ id: milking.id });

  // The next morning the two bulls share what the Pen is given; the cow eats 20 kg on her own.
  await feed(world.fattening.id, "2039-01-03T02:00:00.000Z", 10, 20);
  await feed(world.dairy.id, "2039-01-03T02:00:00.000Z", 20, 0);

  // A Pen fed with nobody in it, as the records have it: 10 kg at 30 and 5 kg of grass, charged to nobody.
  const emptied = await workIn(
    world.empty.id,
    world.sops.feeding.definitionId,
    "2039-01-03T01:00:00.000Z"
  );
  const mover = await as("owner", "2039-01-03T01:30:00.000Z");
  await mover.client.animals.move({
    tagNumber: world.heifer.tagNumber,
    toPenId: world.away.id,
    reason: "অন্য পেনে",
  });
  const late = await as("staff", "2039-01-03T02:00:00.000Z");
  await late.client.instances.completeStep({
    instanceId: emptied.id,
    stepId: "feed",
    evidence: [true],
    feeding: [
      { feedItemId: world.concentrate.id, givenKg: 10 },
      { feedItemId: world.grass.id, givenKg: 5 },
    ],
  });

  // The Vet saw both bulls on one visit, for 1,000: 500 each.
  const vet = await as("vet", "2039-01-05T08:00:00.000Z");
  await vet.client.money.vetFee({
    amountBdt: 1000,
    visitedOn: "2039-01-05",
    animalTags: [world.bullA.tagNumber, bullB],
  });

  // Bull A wormed from a bought lot; bull B given a tonic the farm never bought.
  await dose(
    world.sops.worming.definitionId,
    world.bullA.tagNumber,
    "2039-01-04T08:00:00.000Z"
  );
  await dose(world.sops.tonic.definitionId, bullB, "2039-01-04T09:00:00.000Z");

  const seller = await as("manager", "2039-01-10T04:00:00.000Z");
  const sold = await seller.client.sale.record({
    tagNumber: world.bullA.tagNumber,
    buyer: { name: `কসাই ${suffix}` },
    priceBdt: 60_000,
    weightKg: 270,
    destination: "গাবতলী",
    vehicle: "ঢাকা মেট্রো ট ১১-২২",
    driver: "করিম",
  });
  soldA = sold.id;

  // Bull A has gone: the next morning's feed is bull B's alone.
  await feed(world.fattening.id, "2039-01-11T02:00:00.000Z", 10, 20);

  // Under a milk Withdrawal for a morning, the cow's six litres are poured away, not sent to the tank.
  await scratchDb()
    .update(animal)
    .set({ milkWithdrawalUntil: new Date("2039-01-05T12:00:00.000Z") })
    .where(eq(animal.tagNumber, world.cow.tagNumber));
  const held = await workIn(
    world.dairy.id,
    world.sops.milking.definitionId,
    "2039-01-05T00:30:00.000Z"
  );
  await held.staff.client.instances.completeStep({
    instanceId: held.id,
    stepId: "milk",
    animalTag: world.cow.tagNumber,
    evidence: [6],
  });
  await held.staff.client.instances.completeStep({
    instanceId: held.id,
    stepId: "bulk",
    evidence: [0],
  });
  await held.staff.client.instances.complete({ id: held.id });
  await scratchDb()
    .update(animal)
    .set({ milkWithdrawalUntil: null })
    .where(eq(animal.tagNumber, world.cow.tagNumber));
});

afterAll(async () => {
  const db = scratchDb();
  const definitions = Object.values(world.sops).map((sop) => sop.definitionId);
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(inArray(sopDefinition.id, definitions));
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        inArray(sopInstance.definitionId, definitions),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
  for (const pen of [world.fattening, world.dairy, world.empty]) {
    // oxlint-disable-next-line no-await-in-loop
    await db
      .delete(penAssignment)
      .where(eq(penAssignment.id, `pa-costs-${pen.id}`));
  }
  const manager = await as("manager", "2039-02-01T04:00:00.000Z");
  for (const item of [world.concentrate, world.grass]) {
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.feed.retireItem({ id: item.id });
  }
});

describe("what an animal costs, and what a litre costs", () => {
  it("charges a Pen's feed to the animals standing in it, day by day, and a sold bull's margin", async () => {
    const owner = await as("owner", "2039-02-01T04:00:00.000Z");
    // Bull A: 300 alone, then half of 300; 20 kg of grass alone, then half of 20; one dose at 100; half
    // of the Vet's visit. Bought at 250 kg and sold at 270: 20 kg gained for 1,050.
    expect(
      await owner.client.costs.ofAnimal({ tagNumber: world.bullA.tagNumber })
    ).toEqual({
      side: "fattening",
      feedBdt: 450,
      unpricedKg: 30,
      medicineBdt: 100,
      uncostedDoses: 0,
      vetBdt: 500,
      hasilBdt: 1500,
      tripBdt: 0,
      herdBdt: 0,
      purchaseBdt: 50_000,
      saleBdt: 60_000,
      marginBdt: 7450,
      gainKg: 20,
      costOfGainBdt: 127.5,
      lactation: null,
    });
    expect(soldA).not.toBe("");
  });

  it("shows a dose of a product never bought as uncosted, not as free, and no margin before a sale", async () => {
    const manager = await as("manager", "2039-02-01T04:00:00.000Z");
    // Half of the second morning, and the whole of the morning after bull A left.
    expect(
      await manager.client.costs.ofAnimal({ tagNumber: bullB })
    ).toMatchObject({
      feedBdt: 450,
      unpricedKg: 30,
      medicineBdt: 0,
      uncostedDoses: 1,
      vetBdt: 500,
      purchaseBdt: 40_000,
      saleBdt: null,
      marginBdt: null,
    });
  });

  it("works out a dairy cow's Cost per Litre over her Lactation, from her feed and her litres to Bulk", async () => {
    const owner = await as("owner", "2039-02-01T04:00:00.000Z");
    expect(
      await owner.client.costs.ofAnimal({ tagNumber: world.cow.tagNumber })
    ).toMatchObject({
      side: "dairy",
      // Everything she ate, heifer days included — but a litre is costed over her Lactation alone.
      feedBdt: 1200,
      marginBdt: null,
      // Her six litres poured away under the Withdrawal are not litres to Bulk.
      lactation: expect.objectContaining({
        feedBdt: 600,
        litresToBulk: 10,
        costPerLitreBdt: 60,
      }),
    });
  });

  it("adds a period up by Side", async () => {
    const owner = await as("owner", "2039-02-01T04:00:00.000Z");
    const report = await owner.client.costs.bySide(PERIOD);
    // The period's Dairy side: everything its animals ate in it, over what it sent to Bulk in it.
    expect(report.dairy).toMatchObject({
      feedBdt: 1200,
      unpricedKg: 0,
      medicineBdt: 0,
      uncostedDoses: 0,
      litresToBulk: 10,
      costPerLitreBdt: 120,
    });
    expect(report.fattening).toEqual({
      feedBdt: 900,
      unpricedKg: 60,
      medicineBdt: 100,
      uncostedDoses: 1,
      vetBdt: 1000,
      // The Hasil paid on Bull A when he came off the lorry, in this period as he was.
      hasilBdt: 1500,
      tripBdt: 0,
      herdBdt: 0,
    });
    // The bulls sold in the period, each with a whole life's Margin: a different sum, kept apart.
    expect(report.soldFattening).toEqual({
      animals: [
        {
          tagNumber: world.bullA.tagNumber,
          purchaseBdt: 50_000,
          saleBdt: 60_000,
          marginBdt: 7450,
        },
      ],
      marginBdt: 7450,
    });
    expect(report.unallocated).toEqual({ feedBdt: 300, unpricedKg: 5 });

    // A period after the sale sells nobody, whatever the bull's margin was.
    const february = await owner.client.costs.bySide({
      from: "2039-02-01",
      to: "2039-02-28",
    });
    expect(february.soldFattening).toEqual({ animals: [], marginBdt: 0 });
    expect(february.unallocated).toEqual({ feedBdt: 0, unpricedKg: 0 });
  });

  // Her share of the Trips that moved her and of the month's Herd Costs are parts of what she cost from
  // here on. Nothing fills those two yet.
  it("carries the Trips and the Herd Costs as parts of their own, empty for now", async () => {
    const owner = await as("owner", "2039-02-01T04:00:00.000Z");
    const her = await owner.client.costs.ofAnimal({
      tagNumber: world.bullA.tagNumber,
    });
    expect(her).toMatchObject({ tripBdt: 0, herdBdt: 0 });
    // Bought at 50,000, sold at 60,000, less 450 of feed, 100 of medicine, 500 of the Vet and
    // 1,500 of Hasil.
    expect(her.marginBdt).toBe(7450);
    expect(her.costOfGainBdt).toBe(127.5);

    const cow = await owner.client.costs.ofAnimal({
      tagNumber: world.cow.tagNumber,
    });
    expect(cow.lactation).toMatchObject({
      hasilBdt: 0,
      tripBdt: 0,
      herdBdt: 0,
      costPerLitreBdt: 60,
    });

    const report = await owner.client.costs.bySide(PERIOD);
    expect(report.dairy).toMatchObject({
      hasilBdt: 0,
      tripBdt: 0,
      herdBdt: 0,
      costPerLitreBdt: 120,
    });
  });

  // The haat takes its toll per beast, and often on her price: it is hers alone, never spread over the
  // bulls that came home on the same lorry.
  it("charges the Hasil to the animal it was paid on, and to nobody else", async () => {
    const owner = await as("owner", "2039-02-01T04:00:00.000Z");
    const paid = await owner.client.costs.ofAnimal({
      tagNumber: world.bullA.tagNumber,
    });
    expect(paid.hasilBdt).toBe(1500);
    const none = await owner.client.costs.ofAnimal({ tagNumber: bullB });
    expect(none.hasilBdt).toBe(0);
    // A cow born on the farm was never at a haat.
    const born = await owner.client.costs.ofAnimal({
      tagNumber: world.cow.tagNumber,
    });
    expect(born.hasilBdt).toBe(0);
  });

  it("is the Owner's and the Manager's, and never Barn Staff's or the Vet's", async () => {
    for (const role of ["staff", "vet"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const other = await as(role, "2039-02-01T04:00:00.000Z");
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        other.client.costs.ofAnimal({ tagNumber: world.bullA.tagNumber })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      // oxlint-disable-next-line no-await-in-loop
      await expect(other.client.costs.bySide(PERIOD)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  });
});

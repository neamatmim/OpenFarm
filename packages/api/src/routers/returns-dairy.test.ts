import { eq } from "@OpenFarm/db/operators";
import { animal, penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// What the dairy herd returns, for the Owner: each dairy Animal her own run over her whole stay — one bred here from her
// birth at nothing, one bought or here before the books at a price the Owner enters — charged her Dairy-side shares,
// and paid by her milk to Bulk at each month's Dispatch price and by what she went for at the end. Every calf her own.
//
// Worked by hand. Concentrate at ৳30 a kilo. On 1 January 2045 the opening register takes two cows in milk, M and U,
// both bought; M's heifer calf H and bull calf B, born that day, are registered in the calf Pen.
// - 10 January: 100 kg to the cows, ৳3,000, ৳1,500 each; 20 kg to the calves, ৳600, ৳300 each.
// - 10 January and 10 February: M and U each give 20 litres to Bulk.
// - Milk sold on 20 January at ৳60 a litre and on 5 March at ৳70; none in February, so February's litres go at
//   January's ৳60, never March's.
// - 1 March: B walks across to Fattening, is weighed at 100 kg, and the Owner prices him next day at ৳300 a kilo:
//   ৳30,000, where his dairy run ends.
// - 15 March: M sold for ৳90,000.
// M, priced by the Owner at ৳80,000 from 1 January: ৳81,500 cost; 40 litres × ৳60 = ৳2,400 of milk and ৳90,000 back,
// ৳92,400; ৳10,900, 13.4 on the hundred. Her ৳80,000 was out 73.25 days and her ৳1,500 of feed 63.92, 73.1 days on
// average: 13.374 × 365 ÷ 73.08 is 66.8 a year. Neither calf's money is hers.
// B: ৳300 cost, ৳30,000 back, ৳29,700 — out 50 days, under the floor, so no year.
// H: ৳300 so far, standing, at the Head Price for a calf once the Owner sets one: ৳15,000 to ৳20,000.
// C: U's heifer calf, born 20 March, fed nothing yet — nothing spent, and still worth a calf's Head Price.
// U: not priced, and named until she is; then priced at ৳60,000 from 1 January — ৳61,500 with her feed — her 40
// litres ৳2,400 already back, and at a cow in milk's Head Price of ৳70,000 to ৳90,000.

const suffix = `${Date.now()}`.slice(-7);

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** The Pen's feeding, given by hand at whatever the test says was given. */
const feedingSop = (): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix}` },
  purpose: { bn: "পেনের পশুদের খাওয়ান" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 240,
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

/** Each cow's litres, then what went into the tank. */
const milkingSop = (): SopContent => ({
  name: { bn: `দোহন ${suffix}` },
  purpose: { bn: "দুধ সংগ্রহ" },
  triggers: [{ kind: "schedule", times: ["05:00"] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 240,
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

/** A morning's weigh-in off the crush: what a crossing is priced from. */
const weighInSop = (): SopContent => ({
  name: { bn: `ওজন ${suffix}`, en: "Weigh-in" },
  purpose: { bn: "প্রতিটি পশুর ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 240,
  steps: [
    {
      id: "weigh",
      text: { bn: "ক্রাশে তুলে ওজন নিন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "কেজি" },
          min: 20,
          max: 1200,
        },
      ],
      skipReasons: [{ bn: "ক্রাশে ওঠেনি" }],
      effect: { kind: "weigh_in" },
    },
  ],
});

const pens = { cows: "", calves: "", fattening: "" };
const sops = { feeding: "", milking: "", weighing: "" };
const tags = { m: "", u: "", h: "", b: "", c: "" };
const ids = { m: "", u: "", h: "", b: "", c: "" };
let concentrate = "";

/** The Pen's work of one SOP, due at this instant, claimed by whoever does it. */
const workIn = async (
  role: "manager" | "staff",
  penId: string,
  definitionId: string,
  instant: string
) => {
  const { client: scheduler } = await as("owner", instant);
  await scheduler.work.ensureDue();
  const today = await scheduler.work.today({ penId });
  const work = today.find((row) => row.definitionId === definitionId);
  if (!work) {
    throw new Error("expected the work to be due");
  }
  const { client } = await as(role, instant);
  await client.work.claim({ id: work.id });
  return { client, id: work.id };
};

const feed = async (penId: string, instant: string, givenKg: number) => {
  const { client, id } = await workIn("manager", penId, sops.feeding, instant);
  await client.work.completeStep({
    instanceId: id,
    stepId: "feed",
    evidence: [true],
    feeding: [{ feedItemId: concentrate, givenKg }],
  });
};

const milk = async (instant: string) => {
  const { client, id } = await workIn(
    "manager",
    pens.cows,
    sops.milking,
    instant
  );
  for (const tagNumber of [tags.m, tags.u]) {
    // oxlint-disable-next-line no-await-in-loop -- one cow at a time, as she is milked
    await client.work.completeStep({
      instanceId: id,
      stepId: "milk",
      animalTag: tagNumber,
      evidence: [20],
    });
  }
  await client.work.completeStep({
    instanceId: id,
    stepId: "bulk",
    evidence: [40],
  });
  await client.work.complete({ id });
};

const dispatch = async (on: string, pricePerLitreMoney: number) => {
  const { client } = await as("manager", `${on}T03:00:00.000Z`);
  await client.milk.dispatch({
    dispatchedAt: new Date(`${on}T02:30:00.000Z`),
    litres: 40,
    buyer: { name: `দুধের ক্রেতা ${suffix}` },
    pricePerLitreMoney,
  });
};

beforeAll(async () => {
  const start = "2045-01-01T03:00:00.000Z";
  const { client: owner } = await as("owner", start);
  const shed = await owner.sheds.create({ name: `দুগ্ধ ${suffix}` });
  const pen = async (name: string) => {
    const made = await owner.sheds.pens.create({
      shedId: shed.id,
      name: `${name} ${suffix}`,
    });
    return made.id;
  };
  pens.cows = await pen("দোহন পেন");
  pens.calves = await pen("বাছুর পেন");
  pens.fattening = await pen("মোটাতাজা পেন");
  // The crush is in the fattening Pen, so the person reading the scale has to be assigned to it.
  await as("staff", start);
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-${suffix}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pens.fattening,
    })
    .onConflictDoNothing();

  const register = await owner.animals.importRegister({
    csv: [
      "sex,side,state,pen,source,calved_at,expected_calving",
      `female,dairy,milking,দোহন পেন ${suffix},bought,2044-12-01,`,
      `female,dairy,milking,দোহন পেন ${suffix},bought,2044-12-01,`,
    ].join("\n"),
  });
  if (register.failed.length > 0) {
    throw new Error(JSON.stringify(register.failed));
  }
  [tags.m = "", tags.u = ""] = register.imported.map((row) => row.tagNumber);

  const { client: manager } = await as("manager", "2045-01-01T04:00:00.000Z");
  const calf = async (sex: "female" | "male") =>
    await manager.animals.register({
      sex,
      side: "dairy",
      state: "calf",
      penId: pens.calves,
      source: "born",
      birthDate: new Date("2045-01-01T00:00:00.000Z"),
      aliases: [],
    });
  const h = await calf("female");
  const b = await calf("male");
  tags.h = h.tagNumber;
  tags.b = b.tagNumber;
  for (const key of ["m", "u", "h", "b"] as const) {
    // oxlint-disable-next-line no-await-in-loop -- four animals, looked up one after the other
    const her = await manager.animals.get({ tagNumber: tags[key] });
    ids[key] = her.id;
  }
  // Both calves are M's: the calving that writes a dam is not what this file is about.
  await scratchDb()
    .update(animal)
    .set({ damId: ids.m })
    .where(eq(animal.id, ids.h));
  await scratchDb()
    .update(animal)
    .set({ damId: ids.m })
    .where(eq(animal.id, ids.b));

  const item = await manager.feed.items.create({
    name: { bn: `দানাদার ${suffix}` },
  });
  concentrate = item.id;
  await manager.stock.receive({
    feedItemId: concentrate,
    kind: "purchase",
    quantity: 1000,
    priceMoney: 30_000,
    seller: { name: `দানাদারের দোকান ${suffix}` },
    receivedOn: "2045-01-01",
  });
  const ration = await manager.feed.rations.save({
    name: { bn: `রেশন ${suffix}` },
    items: [{ feedItemId: concentrate, kgPerAnimalPerDay: 5 }],
  });
  for (const penId of [pens.cows, pens.calves]) {
    // oxlint-disable-next-line no-await-in-loop -- two Pens, one after the other
    await manager.feed.rations.assign({ penId, rationId: ration.rationId });
  }
  const feeding = await owner.sops.create({ content: feedingSop() });
  const milking = await owner.sops.create({ content: milkingSop() });
  const weighing = await owner.sops.create({ content: weighInSop() });
  sops.feeding = feeding.definitionId;
  sops.milking = milking.definitionId;
  sops.weighing = weighing.definitionId;

  await feed(pens.cows, "2045-01-10T02:00:00.000Z", 100);
  await feed(pens.calves, "2045-01-10T02:30:00.000Z", 20);
  await milk("2045-01-10T00:30:00.000Z");
  await milk("2045-02-10T00:30:00.000Z");
  await dispatch("2045-01-20", 60);
  await dispatch("2045-03-05", 70);

  // B across to Fattening before the morning's weigh-in, and priced the next day.
  const { client: walking } = await as("manager", "2045-03-01T01:00:00.000Z");
  await walking.animals.move({
    tagNumber: tags.b,
    toPenId: pens.fattening,
    toSide: "fattening",
  });
  const { client: staff, id: round } = await workIn(
    "staff",
    pens.fattening,
    sops.weighing,
    "2045-03-01T07:30:00.000Z"
  );
  await staff.work.completeStep({
    instanceId: round,
    stepId: "weigh",
    animalTag: tags.b,
    evidence: [100],
  });
  const { client: pricing } = await as("owner", "2045-03-02T04:00:00.000Z");
  const { crossings } = await pricing.returns.list();
  await pricing.returns.priceCrossing({
    joiningId: crossings.find((one) => one.tagNumber === tags.b)?.id ?? "",
    rateMoneyPerKg: 300,
    note: `বাছুরের দর ${suffix}`,
  });

  const { client: calving } = await as("manager", "2045-03-20T04:00:00.000Z");
  const c = await calving.animals.register({
    sex: "female",
    side: "dairy",
    state: "calf",
    penId: pens.calves,
    source: "born",
    birthDate: new Date("2045-03-20T00:00:00.000Z"),
    aliases: [],
  });
  tags.c = c.tagNumber;
  const hers = await calving.animals.get({ tagNumber: tags.c });
  ids.c = hers.id;
  await scratchDb()
    .update(animal)
    .set({ damId: ids.u })
    .where(eq(animal.id, ids.c));

  const { client: selling } = await as("manager", "2045-03-15T00:00:00.000Z");
  await selling.sales.record({
    tagNumber: tags.m,
    buyer: { name: `কসাই ${suffix}` },
    destination: "গাবতলী পশুর হাট",
    vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৪",
    driver: "সোহেল",
    priceMoney: 90_000,
    weightKg: 380,
  });
});

const READ_AT = "2045-04-01T04:00:00.000Z";

const dairyPage = async () => {
  const { client: owner } = await as("owner", READ_AT);
  const { dairy } = await owner.returns.list();
  const gone = (tagNumber: string) =>
    dairy.gone.find((one) => one.tagNumber === tagNumber);
  return { dairy, gone };
};

describe("a cow bought, or here before the books", () => {
  it("is named, and in no figure, until the Owner prices her", async () => {
    const { dairy, gone } = await dairyPage();
    expect(gone(tags.m)).toMatchObject({
      returnOnCost: null,
      gaps: [{ tagNumber: tags.m, why: "no_entry_price" }],
    });
    expect(dairy.toPrice.map((one) => one.tagNumber).toSorted()).toEqual(
      [tags.m, tags.u].toSorted()
    );
  });

  it("counts from the day the Owner's price says, her milk at each month's price, and her Sale at the end", async () => {
    const { client: owner } = await as("owner", READ_AT);
    await owner.returns.priceCow({
      animalId: ids.m,
      priceMoney: 80_000,
      note: `খোলার দিনের দাম ${suffix}`,
    });
    const { dairy, gone } = await dairyPage();
    expect(gone(tags.m)).toMatchObject({
      came: "priced",
      left: { how: "sold" },
      costMoney: 81_500,
      milkLitres: 40,
      milkMoney: 2400,
      endMoney: 90_000,
      // February had milk and no Dispatch: January's price, never March's.
      milkPricedEarlier: ["2045-02"],
      gaps: [],
      returnOnCost: {
        costMoney: 81_500,
        backMoney: 92_400,
        resultMoney: 10_900,
        per100: 13.4,
        averageDays: 73,
        perYear: 66.8,
      },
    });
    expect(dairy.toPrice.map((one) => one.tagNumber)).toEqual([tags.u]);
  });

  it("is never priced for one bred here, who is counted from her birth", async () => {
    const { client: owner } = await as("owner", READ_AT);
    await expect(
      owner.returns.priceCow({
        animalId: ids.h,
        priceMoney: 10_000,
        note: "ভুল",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "bred_here_needs_no_price" },
    });
  });
});

describe("every calf her own", () => {
  it("ends a bull calf's run at his crossing price, from his birth at nothing, and leaves it out of his dam's", async () => {
    const { gone } = await dairyPage();
    expect(gone(tags.b)).toMatchObject({
      came: "born",
      left: { how: "crossed" },
      costMoney: 300,
      milkMoney: 0,
      endMoney: 30_000,
      returnOnCost: {
        costMoney: 300,
        backMoney: 30_000,
        resultMoney: 29_700,
        averageDays: 50,
        perYear: null,
      },
    });
    // His dam's ৳92,400 back is her own milk and her own Sale, nothing of his.
    expect(gone(tags.m)?.returnOnCost?.backMoney).toBe(92_400);
  });

  it("shows a cow's calves beside her, each with her own figure", async () => {
    const { client: owner } = await as("owner", READ_AT);
    const hers = await owner.returns.forAnimal({ animalId: ids.m });
    expect(hers?.run.tagNumber).toBe(tags.m);
    expect(hers?.calves.map((one) => one.tagNumber).toSorted()).toEqual(
      [tags.h, tags.b].toSorted()
    );
  });
});

describe("a dairy Animal still here", () => {
  it("is named, not counted, while her kind has no Head Price, and counts at it once set — one who has cost nothing too", async () => {
    const before = await dairyPage();
    expect(before.dairy.herdNow).toMatchObject({
      head: 3,
      running: null,
      gaps: expect.arrayContaining([
        { tagNumber: tags.h, why: "no_head_price" },
        { tagNumber: tags.c, why: "no_head_price" },
        { tagNumber: tags.u, why: "no_entry_price" },
      ]),
    });

    const { client: owner } = await as("owner", READ_AT);
    await owner.returns.setHeadPrice({
      kind: "calf",
      lowMoney: 15_000,
      highMoney: 20_000,
    });
    const { dairy } = await dairyPage();
    // H and C at a calf's price, C though she has cost nothing; U left out whole — not priced, and no Head Price set
    // for a cow in milk.
    expect(dairy.herdNow).toMatchObject({
      head: 3,
      gaps: [
        { tagNumber: tags.u, why: "no_entry_price" },
        { tagNumber: tags.u, why: "no_head_price" },
      ],
      running: {
        standingCostMoney: 300,
        standingLowMoney: 30_000,
        standingHighMoney: 40_000,
      },
    });
    expect(
      dairy.standing.find((one) => one.tagNumber === tags.c)
    ).toMatchObject({
      costMoney: 0,
      worthToday: { lowMoney: 15_000, highMoney: 20_000 },
      gaps: [],
    });
    expect(dairy.headPrices.find((one) => one.kind === "calf")).toMatchObject({
      lowMoney: 15_000,
      highMoney: 20_000,
    });
  });

  it("says her milk as what she has already brought back, apart from what she would fetch today", async () => {
    const { client: owner } = await as("owner", READ_AT);
    await owner.returns.setHeadPrice({
      kind: "milking",
      lowMoney: 70_000,
      highMoney: 90_000,
    });
    await owner.returns.priceCow({
      animalId: ids.u,
      priceMoney: 60_000,
      note: `খোলার দিনের দাম ${suffix}`,
    });
    const { dairy } = await dairyPage();
    expect(
      dairy.standing.find((one) => one.tagNumber === tags.u)
    ).toMatchObject({
      costMoney: 61_500,
      milkMoney: 2400,
      worthToday: { lowMoney: 70_000, highMoney: 90_000 },
      running: {
        soldResultMoney: 2400,
        standingCostMoney: 61_500,
        standingLowMoney: 70_000,
        standingHighMoney: 90_000,
      },
    });
    // The herd: H, C and U, nobody left out. ৳2,400 of milk already back; ৳61,800 spent on them, worth ৳1,00,000 to
    // ৳1,30,000 today.
    expect(dairy.herdNow).toMatchObject({
      head: 3,
      gaps: [],
      milkMoney: 2400,
      running: {
        soldResultMoney: 2400,
        standingCostMoney: 61_800,
        standingLowMoney: 100_000,
        standingHighMoney: 130_000,
      },
    });
  });

  it("refuses a Head Price whose low is above its high", async () => {
    const { client: owner } = await as("owner", READ_AT);
    await expect(
      owner.returns.setHeadPrice({
        kind: "dry",
        lowMoney: 90_000,
        highMoney: 60_000,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "head_price_backwards" },
    });
  });
});

describe("whose it is", () => {
  it("is the Owner's alone, to read and to price", async () => {
    const { client: manager } = await as("manager", READ_AT);
    await expect(
      manager.returns.forAnimal({ animalId: ids.m })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.returns.priceCow({
        animalId: ids.u,
        priceMoney: 70_000,
        note: "ম্যানেজার",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.returns.setHeadPrice({
        kind: "milking",
        lowMoney: 70_000,
        highMoney: 90_000,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

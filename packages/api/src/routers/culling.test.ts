import type { SopContent } from "@OpenFarm/domain";
import { HEAT } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Why the farm names a dairy cow to the Owner as one to think about letting go: her milk against her keep over her last
// four weeks, empty long after calving or dry and empty, or not settling.
//
// Every expected figure is worked by hand from the feedings, the milkings and the Dispatches, never re-derived the way
// the code derives them — a test that recomputes the answer can never disagree with it.

const suffix = `${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
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

/** Looking over the cows for one in heat. */
const heatWatchSop = (): SopContent => ({
  name: { bn: `গরম পর্যবেক্ষণ ${suffix}` },
  purpose: { bn: "গরম হওয়া গাভী খুঁজে বের করা" },
  triggers: [],
  appliesTo: { side: "dairy" },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "look",
      text: { bn: "প্রতিটি গাভী দেখুন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: [
            { value: "nothing", label: { bn: "কিছু না" } },
            { value: HEAT, label: { bn: "গরম হয়েছে" } },
          ],
        },
      ],
      skipReasons: [{ bn: "পাওয়া যায়নি" }],
      effect: { kind: "observation" },
    },
  ],
});

/** The AI work a heat raises. */
const aiSop = (): SopContent => ({
  name: { bn: `পাল দেওয়া ${suffix}` },
  purpose: { bn: "গরম হওয়া গাভীকে সময়মতো পাল দেওয়া" },
  triggers: [{ kind: "event", event: "heat" }],
  appliesTo: { side: "dairy" },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 60,
  steps: [
    {
      id: "serve",
      text: { bn: "পাল দিন" },
      repeatPerAnimal: false,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: [
            { value: "ai", label: { bn: "কৃত্রিম প্রজনন" } },
            { value: "natural", label: { bn: "ষাঁড় দিয়ে" } },
          ],
        },
        { type: "note", required: true },
        { type: "note", required: false },
        { type: "datetime", required: true },
      ],
      skipReasons: [],
      effect: { kind: "service" },
    },
  ],
});

let milkPen = "";
let dryPen = "";
let concentrate = "";
const sops = { feeding: "", milking: "", watch: "", ai: "" };
/** The cows by what the story makes of them. */
const cow = {
  short: "",
  paying: "",
  emptyLong: "",
  inCalfShort: "",
  dryEmpty: "",
  dryInCalf: "",
  unsettled: "",
};

/** The Pen's work of one SOP, due at this instant, claimed by the Manager. */
const workIn = async (penId: string, definitionId: string, instant: string) => {
  const manager = await as("manager", instant);
  await manager.client.instances.ensureDue();
  const today = await manager.client.instances.today({ penId });
  const work = today.find((row) => row.definitionId === definitionId);
  if (!work) {
    throw new Error("expected the work to be due");
  }
  await manager.client.instances.claim({ id: work.id });
  return { manager, id: work.id };
};

const feed = async (instant: string, givenKg: number) => {
  const { manager, id } = await workIn(milkPen, sops.feeding, instant);
  await manager.client.instances.completeStep({
    instanceId: id,
    stepId: "feed",
    evidence: [true],
    feeding: [{ feedItemId: concentrate, givenKg }],
  });
};

const milk = async (instant: string, litres: [string, number][]) => {
  const { manager, id } = await workIn(milkPen, sops.milking, instant);
  for (const [tagNumber, given] of litres) {
    // oxlint-disable-next-line no-await-in-loop -- one cow at a time, as she is milked
    await manager.client.instances.completeStep({
      instanceId: id,
      stepId: "milk",
      animalTag: tagNumber,
      evidence: [given],
    });
  }
  await manager.client.instances.completeStep({
    instanceId: id,
    stepId: "bulk",
    evidence: [litres.reduce((sum, [, given]) => sum + given, 0)],
  });
  await manager.client.instances.complete({ id });
};

/** Seen in heat on `day` and served that noon, on the AI work her heat raised. */
const heatAndServe = async (day: string, tagNumber: string) => {
  const manager = await as("manager", `${day}T00:00:00.000Z`);
  await manager.client.instances.raiseNow({
    definitionId: sops.watch,
    penId: dryPen,
  });
  const rounds = await manager.client.instances.today({ penId: dryPen });
  const round = rounds.find((row) => row.definitionId === sops.watch);
  await manager.client.instances.claim({ id: round?.id ?? "" });
  await manager.client.instances.completeStep({
    instanceId: round?.id ?? "",
    stepId: "look",
    animalTag: tagNumber,
    evidence: [HEAT],
  });

  const serving = await as("manager", `${day}T20:00:00.000Z`);
  await serving.client.instances.ensureDue();
  const her = await serving.client.animals.byTag({ tagNumber });
  const work = [
    ...(await serving.client.instances.today({ penId: dryPen })),
    ...(await serving.client.instances.overdue()),
  ];
  const aiWork = work.find(
    (row) => row.definitionId === sops.ai && row.animalId === her.id
  );
  await serving.client.instances.claim({ id: aiWork?.id ?? "" });
  await serving.client.instances.completeStep({
    instanceId: aiWork?.id ?? "",
    stepId: "serve",
    evidence: ["ai", "HF-2231-BD", "রহিম", `${day}T12:00:00.000Z`],
  });
  await serving.client.instances.complete({ id: aiWork?.id ?? "" });
};

beforeAll(async () => {
  const start = "2040-12-01T03:00:00.000Z";
  const owner = await as("owner", start);
  const manager = await as("manager", start);
  const shed = await owner.client.herd.createShed({ name: `cull-${suffix}` });
  const milking = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `দোহন পেন ${suffix}`,
  });
  const dry = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `শুকনো পেন ${suffix}`,
  });
  milkPen = milking.id;
  dryPen = dry.id;

  // Four cows in milk, two dry and a heifer, on the opening register on the 1st of December.
  const register = await owner.client.animals.importRegister({
    csv: [
      "sex,side,state,pen,source,calved_at,expected_calving",
      // 121 days since calving on the 1st of March, and nobody has found her carrying.
      `female,dairy,milking,দোহন পেন ${suffix},bought,2040-10-31,`,
      `female,dairy,milking,দোহন পেন ${suffix},bought,2040-12-01,`,
      // 181 days since calving on the 1st of March, still empty.
      `female,dairy,milking,দোহন পেন ${suffix},bought,2040-09-01,`,
      // 212 days since calving, but in calf again.
      `female,dairy,milking,দোহন পেন ${suffix},bought,2040-08-01,2041-05-15`,
      `female,dairy,dry,শুকনো পেন ${suffix},bought,,`,
      `female,dairy,dry,শুকনো পেন ${suffix},bought,,2041-04-01`,
      `female,dairy,heifer,শুকনো পেন ${suffix},born,,`,
    ].join("\n"),
  });
  if (register.failed.length > 0) {
    throw new Error(JSON.stringify(register.failed));
  }
  const tags = register.imported.map((row) => row.tagNumber);
  [
    cow.short = "",
    cow.paying = "",
    cow.emptyLong = "",
    cow.inCalfShort = "",
    cow.dryEmpty = "",
    cow.dryInCalf = "",
    cow.unsettled = "",
  ] = tags;

  // Concentrate at ৳30 a kilo, for the cows in milk alone.
  const item = await manager.client.feed.addItem({
    name: { bn: `দানাদার ${suffix}` },
  });
  concentrate = item.id;
  await manager.client.stock.receive({
    feedItemId: concentrate,
    kind: "purchase",
    quantity: 1000,
    priceBdt: 30_000,
    seller: { name: `দানাদারের দোকান ${suffix}` },
    receivedOn: "2040-12-01",
  });
  const ration = await manager.client.feed.saveRation({
    name: { bn: `রেশন ${suffix}` },
    items: [{ feedItemId: concentrate, kgPerAnimalPerDay: 10 }],
  });
  await manager.client.feed.assignRation({
    penId: milkPen,
    rationId: ration.rationId,
  });
  const feeding = await owner.client.sops.create({ content: feedingSop() });
  const milkingWork = await owner.client.sops.create({
    content: milkingSop(),
  });
  const watch = await owner.client.sops.create({ content: heatWatchSop() });
  const ai = await owner.client.sops.create({ content: aiSop() });
  sops.feeding = feeding.definitionId;
  sops.milking = milkingWork.definitionId;
  sops.watch = watch.definitionId;
  sops.ai = ai.definitionId;

  // The heifer on four heats three weeks apart: each came back into heat, so three of them did not take.
  await heatAndServe("2040-12-05", cow.unsettled);
  await heatAndServe("2040-12-26", cow.unsettled);
  await heatAndServe("2041-01-16", cow.unsettled);
  await heatAndServe("2041-02-06", cow.unsettled);

  // 280 kg on the 10th and again on the 20th of February, ৳8,400 each, split four ways: ৳4,200 of keep a cow.
  await feed("2041-02-10T02:00:00.000Z", 280);
  await feed("2041-02-20T02:00:00.000Z", 280);

  // Two milkings in the four weeks: 40 litres each from the one that pays and the one long empty, 20 from the two
  // that do not.
  const litres: [string, number][] = [
    [cow.short, 20],
    [cow.paying, 40],
    [cow.emptyLong, 40],
    [cow.inCalfShort, 20],
  ];
  await milk("2041-02-10T00:30:00.000Z", litres);
  await milk("2041-02-20T00:30:00.000Z", litres);

  // Milk sold at ৳100 on the 20th of December, more than two months before the 1st of March, and at ৳55 on the 21st of
  // February: ৳55 is what a litre fetched.
  const buyer = { name: `দুধের ক্রেতা ${suffix}` };
  const december = await as("manager", "2040-12-20T03:00:00.000Z");
  await december.client.milk.dispatch({
    dispatchedAt: new Date("2040-12-20T02:30:00.000Z"),
    litres: 100,
    buyer,
    pricePerLitreBdt: 100,
  });
  const february = await as("manager", "2041-02-21T03:00:00.000Z");
  await february.client.milk.dispatch({
    dispatchedAt: new Date("2041-02-21T02:30:00.000Z"),
    litres: 240,
    buyer,
    pricePerLitreBdt: 55,
  });
});

/** The farm's four weeks of keep and five weeks before milk is weighed, put back together as a new farm has them. */
const backToFourWeeks = async () => {
  const owner = await as("owner", "2041-03-01T06:00:00.000Z");
  await owner.client.farm.setParameters({
    keepReadDays: 28,
    cullMilkAfterDays: 35,
  });
};

const theList = async () => {
  const owner = await as("owner", "2041-03-01T04:00:00.000Z");
  const list = await owner.client.culling.list();
  const of = (tagNumber: string) =>
    list.cows.find((one) => one.tagNumber === tagNumber);
  return { list, of };
};

describe("why the farm names a dairy cow to the Owner", () => {
  it("weighs her milk against her keep over her last four weeks, at what a litre fetched lately", async () => {
    const { list, of } = await theList();
    // The farm's own days, as a new farm starts with them.
    expect(list.openDays).toBe(150);
    expect(list.milkAfterDays).toBe(35);
    expect(list.milkPriceDays).toBe(60);
    expect(list.milkPrice).toMatchObject({
      bdtPerLitre: 55,
      litres: 240,
      days: 60,
    });
    // 40 litres in the four weeks at ৳55 is ৳2,200, against ৳4,200 of keep: ৳2,000 short, and a litre costs her ৳105
    // to make. 121 days since she calved, and nobody has found her carrying.
    expect(of(cow.short)).toMatchObject({
      state: "milking",
      daysSinceCalving: 121,
      inCalfDue: null,
      failedAttempts: null,
      milk: {
        known: true,
        days: 28,
        litres: 40,
        litresPerDay: 1.43,
        bdtPerLitre: 55,
        worthBdt: 2200,
        keepBdt: 4200,
        overKeepBdt: -2000,
        costPerLitreBdt: 105,
        whole: true,
      },
      reasons: ["milk_short"],
    });
    // 80 litres fetch ৳4,400: ৳200 over her keep, and nothing to say.
    expect(of(cow.paying)).toMatchObject({
      milk: { worthBdt: 4400, overKeepBdt: 200 },
      reasons: [],
    });
  });

  it("names one still empty long after calving, or dry and empty, and never one in calf", async () => {
    const { of } = await theList();
    expect(of(cow.emptyLong)).toMatchObject({
      daysSinceCalving: 181,
      milk: { overKeepBdt: 200 },
      reasons: ["open_long"],
    });
    // Her milk is as short as the first cow's and she is 212 days from calving, but she is carrying.
    expect(of(cow.inCalfShort)).toMatchObject({
      daysSinceCalving: 212,
      milk: { overKeepBdt: -2000 },
      reasons: [],
    });
    expect(of(cow.dryEmpty)).toMatchObject({
      state: "dry",
      milk: null,
      reasons: ["open_long"],
    });
    expect(of(cow.dryInCalf)?.reasons).toEqual([]);
  });

  it("names a heifer who will not settle, as the Manager's queue does", async () => {
    const { of } = await theList();
    expect(of(cow.unsettled)).toMatchObject({
      state: "heifer",
      failedAttempts: 3,
      milk: null,
      reasons: ["repeat_breeder"],
    });
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2041-03-01T04:00:00.000Z");
    await expect(manager.client.culling.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("counts empty days against the farm's own setting, which only the Owner may change", async () => {
    const owner = await as("owner", "2041-03-01T04:00:00.000Z");
    const manager = await as("manager", "2041-03-01T04:00:00.000Z");
    await expect(
      manager.client.farm.setParameters({ cullOpenDays: 120 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await owner.client.farm.setParameters({ cullOpenDays: 120 });
    // 121 days since she calved: past 120, so the cow whose milk is short is empty too long as well.
    const { list, of } = await theList();
    expect(list.openDays).toBe(120);
    expect(of(cow.short)?.reasons).toEqual(["milk_short", "open_long"]);
    // Put back as the farm had it, for whatever reads this farm after.
    await owner.client.farm.setParameters({ cullOpenDays: 150 });
  });

  it("weighs a cow's milk only as many days into her Lactation as the Owner says, and never before five weeks", async () => {
    const owner = await as("owner", "2041-03-01T04:00:00.000Z");
    const manager = await as("manager", "2041-03-01T04:00:00.000Z");
    await expect(
      manager.client.farm.setParameters({ cullMilkAfterDays: 125 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Her calf's week and the four weeks read after it: any sooner and the four weeks take in the calf's milk.
    await expect(
      owner.client.farm.setParameters({ cullMilkAfterDays: 34 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await owner.client.farm.setParameters({ cullMilkAfterDays: 125 });
    // 121 days into her Lactation: not yet weighed at 125, so her short milk is no reason yet.
    const { list, of } = await theList();
    expect(list.milkAfterDays).toBe(125);
    expect(of(cow.short)).toMatchObject({
      milk: { known: false, because: "too_soon" },
      reasons: [],
    });
    // The one 181 days in is weighed as before.
    expect(of(cow.emptyLong)?.milk).toMatchObject({ overKeepBdt: 200 });
    await owner.client.farm.setParameters({ cullMilkAfterDays: 35 });
  });

  it("prices a litre over as many days of Dispatches as the Owner says", async () => {
    const owner = await as("owner", "2041-03-01T04:00:00.000Z");
    const manager = await as("manager", "2041-03-01T04:00:00.000Z");
    await expect(
      manager.client.farm.setParameters({ cullMilkPriceDays: 90 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      owner.client.farm.setParameters({ cullMilkPriceDays: 6 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Ninety days back from the 1st of March takes in December's 100 litres at ৳100 beside February's 240 at ৳55:
    // ৳23,200 over 340 litres is ৳68.24. The first cow's 40 litres then fetch ৳2,729.60, ৳1,470.40 short of ৳4,200.
    await owner.client.farm.setParameters({ cullMilkPriceDays: 90 });
    const wide = await theList();
    expect(wide.list.milkPriceDays).toBe(90);
    expect(wide.list.milkPrice).toMatchObject({
      bdtPerLitre: 68.24,
      litres: 340,
      days: 90,
    });
    expect(wide.of(cow.short)?.milk).toMatchObject({
      bdtPerLitre: 68.24,
      worthBdt: 2729.6,
      overKeepBdt: -1470.4,
    });

    // A week back from the 1st of March holds no Dispatch at all: no litre has a price, and no cow's milk is weighed.
    await owner.client.farm.setParameters({ cullMilkPriceDays: 7 });
    const narrow = await theList();
    expect(narrow.list.milkPrice).toBeNull();
    expect(narrow.list.milkPriceDays).toBe(7);
    expect(narrow.of(cow.short)).toMatchObject({
      milk: { known: false, because: "no_price" },
      reasons: [],
    });
    await owner.client.farm.setParameters({ cullMilkPriceDays: 60 });
  });

  it("weighs a cow's milk and her keep over the same days, as many as the Owner says", async () => {
    const owner = await as("owner", "2041-03-01T04:00:00.000Z");
    await owner.client.farm.setParameters({
      keepReadDays: 14,
      cullMilkAfterDays: 21,
    });
    try {
      // A fortnight back from the 1st of March is the 15th of February: the 20th's feeding and milking are inside it,
      // the 10th's are not. ৳8,400 split four ways is ৳2,100 of keep; 20 litres at ৳55 fetch ৳1,100, ৳1,000 short, and
      // a litre costs her ৳105 to make.
      const { list, of } = await theList();
      expect(list.keepReadDays).toBe(14);
      expect(of(cow.short)?.milk).toEqual({
        known: true,
        days: 14,
        litres: 20,
        litresPerDay: 1.43,
        bdtPerLitre: 55,
        worthBdt: 1100,
        keepBdt: 2100,
        overKeepBdt: -1000,
        costPerLitreBdt: 105,
        whole: true,
      });
    } finally {
      // Put back together, whatever went wrong above, so no later test reads this farm's fortnight.
      await backToFourWeeks();
    }
  });

  it("reads a keep over as many days as the Owner says, a fortnight to three months, and holds the milk wait a week past them", async () => {
    const owner = await as("owner", "2041-03-01T04:00:00.000Z");
    const manager = await as("manager", "2041-03-01T04:00:00.000Z");
    await expect(
      manager.client.farm.setParameters({ keepReadDays: 42 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const keepReadDays of [13, 91]) {
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time
      await expect(
        owner.client.farm.setParameters({ keepReadDays })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    // Six weeks of keep while milk is still weighed at 35 days would take in the calf's week: the wait must be 49, and
    // the refusal says so by its own word, for the screen to say in the reader's language.
    await expect(
      owner.client.farm.setParameters({ keepReadDays: 42 })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "milk_weighed_too_soon", soonestDays: 49 },
    });
    // And the wait cannot come down under a week past the four weeks read now.
    await expect(
      owner.client.farm.setParameters({ cullMilkAfterDays: 34 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // A fortnight's keep, and milk weighed from three weeks: set together, the two agree.
    await owner.client.farm.setParameters({
      keepReadDays: 14,
      cullMilkAfterDays: 21,
    });
    try {
      const { list } = await theList();
      expect(list.milkAfterDays).toBe(21);
    } finally {
      await backToFourWeeks();
    }
  });
});

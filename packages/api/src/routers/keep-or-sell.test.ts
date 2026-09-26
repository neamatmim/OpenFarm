import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Keep her or sell her, as money: what her keep — feed, doses, the Vet's visits and Herd Costs — has cost a day over her
// last four weeks,
// over the rate she is gaining at now, set beside the price a kilo she is priced at.
//
// Every expected figure is worked by hand from the feedings and the readings, never re-derived the way the code derives
// them — a test that recomputes the answer can never disagree with it.

const suffix = `${Date.now()}`;

const as = (role: "owner" | "manager" | "vet", instant: string) =>
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

/** A dose of one product, given by hand to whichever animal the test names. */
const dosingSop = (productId: string, name: string): SopContent => ({
  name: { bn: `${name} ${suffix}` },
  purpose: { bn: "পশুকে ওষুধ" },
  triggers: [],
  appliesTo: { side: "fattening" },
  assignedRole: "manager",
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

/** The round that puts a bull on the scale, and nothing else. */
const weighInSop = (): SopContent => ({
  name: { bn: `ওজন ${suffix}` },
  purpose: { bn: "প্রতিটি পশুর ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
  assignedRole: "manager",
  checkerRole: null,
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

let fedPen = "";
let hungryPen = "";
let concentrate = "";
let feedingId = "";
let weighingId = "";
let wormingId = "";
let tonicId = "";
/** Fed and weighed; weighed and never fed in four weeks; and a week-old arrival. */
let kept = "";
let unfed = "";
let newcomer = "";

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
  const { manager, id } = await workIn(fedPen, feedingId, instant);
  await manager.client.instances.completeStep({
    instanceId: id,
    stepId: "feed",
    evidence: [true],
    feeding: [{ feedItemId: concentrate, givenKg }],
  });
};

const weigh = async (
  penId: string,
  instant: string,
  readings: [string, number][]
) => {
  const { manager, id } = await workIn(penId, weighingId, instant);
  for (const [tagNumber, kg] of readings) {
    // oxlint-disable-next-line no-await-in-loop -- one animal at a time, as a round is walked
    await manager.client.instances.completeStep({
      instanceId: id,
      stepId: "weigh",
      animalTag: tagNumber,
      evidence: [kg],
    });
  }
};

/** One dose, raised in the fed Pen and given to one animal. */
const dose = async (
  definitionId: string,
  tagNumber: string,
  instant: string
) => {
  const manager = await as("manager", instant);
  await manager.client.instances.raiseNow({ definitionId, penId: fedPen });
  const today = await manager.client.instances.today({ penId: fedPen });
  const raised = today.find((row) => row.definitionId === definitionId);
  await manager.client.instances.claim({ id: raised?.id ?? "" });
  await manager.client.instances.completeStep({
    instanceId: raised?.id ?? "",
    stepId: "dose",
    animalTag: tagNumber,
    evidence: [true],
  });
};

const bullInto = async (penId: string, instant: string) => {
  const manager = await as("manager", instant);
  const bull = await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceBdt: 50_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
    targetWindowStart: "2040-06-01",
    targetWindowEnd: "2040-06-05",
  });
  return bull.tagNumber;
};

beforeAll(async () => {
  const owner = await as("owner", "2040-01-01T03:00:00.000Z");
  const manager = await as("manager", "2040-01-01T03:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: `keep-${suffix}` });
  const fed = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `খাওয়ানো পেন ${suffix}`,
  });
  const hungry = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `অন্য পেন ${suffix}`,
  });
  fedPen = fed.id;
  hungryPen = hungry.id;

  // Concentrate at ৳30 a kilo, and more of it than the Pen will eat.
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
    receivedOn: "2040-01-01",
  });
  const ration = await manager.client.feed.saveRation({
    name: { bn: `রেশন ${suffix}` },
    items: [{ feedItemId: concentrate, kgPerAnimalPerDay: 10 }],
  });
  await manager.client.feed.assignRation({
    penId: fedPen,
    rationId: ration.rationId,
  });
  const feeding = await owner.client.sops.create({ content: feedingSop() });
  const weighing = await owner.client.sops.create({ content: weighInSop() });
  feedingId = feeding.definitionId;
  weighingId = weighing.definitionId;

  // A wormer at ৳2,800 for ten doses, ৳280 a dose; a tonic the farm has never bought.
  const vet = await as("vet", "2040-01-01T03:00:00.000Z");
  const wormer = await vet.client.drugs.add({
    name: { bn: `কৃমিনাশক ${suffix}` },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 0,
  });
  const tonic = await vet.client.drugs.add({
    name: { bn: `টনিক ${suffix}` },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 0,
  });
  await manager.client.drugs.purchase({
    drugProductId: wormer.id,
    quantity: "১০ ডোজ",
    doses: 10,
    priceBdt: 2800,
    seller: { name: `ফার্মেসি ${suffix}` },
    purchasedOn: "2040-01-01",
  });
  const worming = await owner.client.sops.create({
    content: dosingSop(wormer.id, "কৃমি"),
  });
  const tonicking = await owner.client.sops.create({
    content: dosingSop(tonic.id, "টনিক"),
  });
  wormingId = worming.definitionId;
  tonicId = tonicking.definitionId;

  kept = await bullInto(fedPen, "2040-01-02T04:00:00.000Z");
  unfed = await bullInto(hungryPen, "2040-01-02T04:00:00.000Z");

  // 100 kg on the 20th of January: ৳3,000, and more than four weeks before the 1st of March.
  await feed("2040-01-20T02:00:00.000Z", 100);
  // 140 kg on the 10th and again on the 24th of February: ৳4,200 each, ৳8,400 in the four weeks.
  await feed("2040-02-10T02:00:00.000Z", 140);
  await feed("2040-02-24T02:00:00.000Z", 140);

  // Wormed on the 20th of February, ৳280 inside the four weeks; and a dose of the tonic nobody paid for on the 21st.
  await dose(wormingId, kept, "2040-02-20T04:00:00.000Z");
  await dose(tonicId, kept, "2040-02-21T04:00:00.000Z");
  // The Vet saw both bulls on one visit on the 22nd, for ৳560: ৳280 each.
  const visiting = await as("vet", "2040-02-22T08:00:00.000Z");
  await visiting.client.money.vetFee({
    amountBdt: 560,
    visitedOn: "2040-02-22",
    animalTags: [kept, unfed],
  });

  // 300 kg on the 1st of February and 314 kg a fortnight later: a kilo a day, lately.
  await weigh(fedPen, "2040-02-01T02:00:00.000Z", [[kept, 300]]);
  await weigh(fedPen, "2040-02-15T02:00:00.000Z", [[kept, 314]]);
  // The one in the other Pen gains too, and is never fed there as the records have it.
  await weigh(hungryPen, "2040-02-01T02:00:00.000Z", [[unfed, 300]]);
  await weigh(hungryPen, "2040-02-15T02:00:00.000Z", [[unfed, 321]]);

  // Four days off the lorry on the 1st of March.
  newcomer = await bullInto(hungryPen, "2040-02-26T04:00:00.000Z");

  const pricing = await as("owner", "2040-03-01T03:00:00.000Z");
  await pricing.client.fattening.setMarketPrice({
    lowBdtPerKg: 280,
    highBdtPerKg: 320,
  });
});

describe("keep her or sell her", () => {
  it("sets what a kilo she puts on now costs beside her price, from her keep over the last four weeks", async () => {
    const owner = await as("owner", "2040-03-01T04:00:00.000Z");
    const { animals } = await owner.client.fattening.prices();
    const hers = animals.find((one) => one.tagNumber === kept);
    // ৳8,400 of feed, a ৳280 dose and ৳280 of the Vet's visit over the 28 days since the 2nd of February is ৳320 a day;
    // January's feeding is not in it. A kilo a day on that is ৳320 a kilo: not over the market's high price of ৳320, so
    // what she fetches still decides. The next fortnight: 14 kg for ৳4,480 of keep, fetching ৳3,920 at ৳280 (৳560
    // short) and ৳4,480 at ৳320 (nothing over). The tonic nobody bought is in it at nothing, and said: her keep is short
    // by it.
    expect(hers?.keep).toEqual({
      known: true,
      keepBdtPerDay: 320,
      dailyGainKg: 1,
      costOfGainNowBdt: 320,
      ahead: {
        days: 14,
        gainKg: 14,
        keepBdt: 4480,
        low: { worthBdt: 3920, overKeepBdt: -560 },
        high: { worthBdt: 4480, overKeepBdt: 0 },
      },
      keeping: "close",
      whole: false,
    });
  });

  it("says keeping pays once a kilo fetches more than it costs to put on", async () => {
    const owner = await as("owner", "2040-03-01T05:00:00.000Z");
    await owner.client.fattening.setMarketPrice({
      lowBdtPerKg: 320,
      highBdtPerKg: 380,
    });
    const later = await as("owner", "2040-03-01T06:00:00.000Z");
    const { animals } = await later.client.fattening.prices();
    const hers = animals.find((one) => one.tagNumber === kept)?.keep;
    expect(hers?.known && hers.keeping).toBe("pays");
    await later.client.fattening.setMarketPrice({
      lowBdtPerKg: 280,
      highBdtPerKg: 320,
    });
  });

  it("reads her keep over as many days as the Owner says", async () => {
    const owner = await as("owner", "2040-03-01T04:00:00.000Z");
    await owner.client.farm.setParameters({ keepReadDays: 14 });
    try {
      const later = await as("owner", "2040-03-01T04:30:00.000Z");
      const { animals, keepReadDays } = await later.client.fattening.prices();
      expect(keepReadDays).toBe(14);
      // A fortnight back from the 1st of March is the 16th of February: the 24th's ৳4,200 of feed, the 20th's ৳280 dose
      // and the 22nd's ৳280 of the Vet's visit are inside it, the 10th's feeding is not. ৳4,760 over 14 days is ৳340 a
      // day, over the market's high price of ৳320: at a kilo a day she costs more to keep than she puts on.
      expect(animals.find((one) => one.tagNumber === kept)?.keep).toMatchObject(
        {
          known: true,
          keepBdtPerDay: 340,
          costOfGainNowBdt: 340,
          ahead: {
            keepBdt: 4760,
            low: { overKeepBdt: -840 },
            high: { overKeepBdt: -280 },
          },
          keeping: "costs_more",
        }
      );
    } finally {
      // Put back whatever went wrong above, so no later test reads this farm's fortnight.
      await owner.client.farm.setParameters({ keepReadDays: 28 });
    }
  });

  it("works keeping her as many days ahead as the Owner says, a week to three months, and only the Owner", async () => {
    const owner = await as("owner", "2040-03-01T04:00:00.000Z");
    const manager = await as("manager", "2040-03-01T04:00:00.000Z");
    await expect(
      manager.client.farm.setParameters({ keepAheadDays: 7 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const keepAheadDays of [6, 91]) {
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time
      await expect(
        owner.client.farm.setParameters({ keepAheadDays })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await owner.client.farm.setParameters({ keepAheadDays: 7 });
    try {
      const later = await as("owner", "2040-03-01T04:30:00.000Z");
      const { animals, keepAheadDays } = await later.client.fattening.prices();
      expect(keepAheadDays).toBe(7);
      // Her ৳320 a day over the four weeks read, a week ahead at a kilo a day: 7 kg for ৳2,240 of keep, fetching ৳1,960
      // at ৳280 (৳280 short) and ৳2,240 at ৳320 (nothing over). A kilo still costs ৳320 to put on: the same verdict.
      expect(animals.find((one) => one.tagNumber === kept)?.keep).toMatchObject(
        {
          costOfGainNowBdt: 320,
          ahead: {
            days: 7,
            gainKg: 7,
            keepBdt: 2240,
            low: { worthBdt: 1960, overKeepBdt: -280 },
            high: { worthBdt: 2240, overKeepBdt: 0 },
          },
          keeping: "close",
        }
      );
    } finally {
      // Put back whatever went wrong above, so no later test reads this farm's week.
      await owner.client.farm.setParameters({ keepAheadDays: 14 });
    }
  });

  it("says why it cannot tell for one never fed in four weeks, and one a few days off the lorry", async () => {
    const owner = await as("owner", "2040-03-01T07:00:00.000Z");
    const { animals } = await owner.client.fattening.prices();
    expect(animals.find((one) => one.tagNumber === unfed)?.keep).toEqual({
      known: false,
      because: "not_fed",
    });
    expect(animals.find((one) => one.tagNumber === newcomer)?.keep).toEqual({
      known: false,
      because: "too_new",
    });
  });
});

import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Keep her or sell her, as money: what her keep has cost a day over her last four weeks, over the rate she is gaining
// at now, set beside the price a kilo she is priced at.
//
// Every expected figure is worked by hand from the feedings and the readings, never re-derived the way the code derives
// them — a test that recomputes the answer can never disagree with it.

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

  kept = await bullInto(fedPen, "2040-01-02T04:00:00.000Z");
  unfed = await bullInto(hungryPen, "2040-01-02T04:00:00.000Z");

  // 100 kg on the 20th of January: ৳3,000, and more than four weeks before the 1st of March.
  await feed("2040-01-20T02:00:00.000Z", 100);
  // 140 kg on the 10th and again on the 24th of February: ৳4,200 each, ৳8,400 in the four weeks.
  await feed("2040-02-10T02:00:00.000Z", 140);
  await feed("2040-02-24T02:00:00.000Z", 140);

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
    // ৳8,400 over the 28 days since the 2nd of February is ৳300 a day; January's feeding is not in it. A kilo a day on
    // that is ৳300 a kilo, between the market's ৳280 and ৳320, so what she fetches decides. The next fortnight: 14 kg
    // for ৳4,200 of keep, fetching ৳3,920 at ৳280 (৳280 short) and ৳4,480 at ৳320 (৳280 over).
    expect(hers?.keep).toEqual({
      known: true,
      keepBdtPerDay: 300,
      dailyGainKg: 1,
      costOfGainNowBdt: 300,
      ahead: {
        days: 14,
        gainKg: 14,
        keepBdt: 4200,
        low: { worthBdt: 3920, overKeepBdt: -280 },
        high: { worthBdt: 4480, overKeepBdt: 280 },
      },
      keeping: "close",
      whole: true,
    });
  });

  it("says keeping pays once a kilo fetches more than it costs to put on", async () => {
    const owner = await as("owner", "2040-03-01T05:00:00.000Z");
    await owner.client.fattening.setMarketPrice({
      lowBdtPerKg: 300,
      highBdtPerKg: 360,
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

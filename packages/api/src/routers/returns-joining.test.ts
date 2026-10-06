import { penAssignment } from "@OpenFarm/db/schema/herd";
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

// An animal joining the Farm's Fattening side other than by Intake: a calf walked across from Dairy. She joins the
// Season of the Target Window her crossing gave her — the next Eid unless one was said — from the day she crossed, and
// at a price the Owner sets: her weight that day times a rate a kilo. Until then her Season names her and reads
// without her.
//
// Worked by hand. The market is ৳500–600 a kilo. Bull C, 200 kg, bought on 1 October 2030 for ৳70,000 for Eid-ul-Adha
// 2031 (3 April). Calf A walked across from Dairy the same morning with no window said, so she joins Eid 2031 too;
// weighed at 150 kg. Calf B walked across with a winter window of her own, and never weighed.
// - Unpriced, A is left out whole: the Season is C alone — ৳70,000 against ৳1,00,000 to ৳1,20,000 — 42.9 to 71.4.
// - Priced at 150 × ৳400 = ৳60,000, she is in: ৳1,30,000 against C's ৳1,00,000–1,20,000 and her own 150 kg at
//   ৳500–600, ৳75,000–90,000 — ৳1,75,000 to ৳2,10,000: 34.6 to 61.5.

const suffix = `joining-${Date.now()}`;
const EID_2031 = { start: "2031-04-03", end: "2031-04-05" };
const WINTER = { start: "2030-12-15", end: "2031-01-15" };

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

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

let calfA = "";
let calfB = "";
let joiningA = "";
let joiningB = "";
let fatteningPenId = "";
/** The weigh-in round the Pen is walked on. */
let definitionId = "";

beforeAll(async () => {
  const { client: owner } = await as("owner", "2030-09-01T04:00:00.000Z");
  await owner.fattening.setMarketPrice({
    lowMoneyPerKg: 500,
    highMoneyPerKg: 600,
  });
  const shed = await owner.sheds.create({ name: suffix });
  const fattening = await owner.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `মোটাতাজা ${suffix}`,
  });
  fatteningPenId = fattening.id;
  const calves = await owner.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `বাছুর ${suffix}`,
  });
  // The crush is in the fattening Pen, so the person reading the scale has to be assigned to it.
  await as("staff", "2030-09-01T04:00:00.000Z");
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-${suffix}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: fattening.id,
    })
    .onConflictDoNothing();
  ({ definitionId } = await owner.sops.create({ content: weighInSop() }));

  const { client: manager } = await as("manager", "2030-09-01T05:00:00.000Z");
  const calf = async () =>
    await manager.animals.register({
      sex: "male",
      side: "dairy",
      state: "calf",
      penId: calves.id,
      source: "born",
      aliases: [],
    });
  const first = await calf();
  const second = await calf();
  calfA = first.tagNumber;
  calfB = second.tagNumber;

  const { client: buying } = await as("manager", "2030-10-01T00:00:00.000Z");
  await buying.intakes.record({
    penId: fattening.id,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 70_000,
    weightKg: 200,
    estimatedAgeMonths: 18,
    arrivedAt: new Date("2030-10-01T00:00:00Z"),
    targetWindowStart: EID_2031.start,
    targetWindowEnd: EID_2031.end,
  });
  const { client: walking } = await as("manager", "2030-10-01T01:00:00.000Z");
  await walking.animals.move({
    tagNumber: calfA,
    toPenId: fattening.id,
    toSide: "fattening",
  });
  await walking.animals.move({
    tagNumber: calfB,
    toPenId: fattening.id,
    toSide: "fattening",
    targetWindow: WINTER,
  });

  // The morning's weigh-in reads A off the crush; B would not go on.
  const { client: scheduler } = await as("owner", "2030-10-01T07:30:00.000Z");
  await scheduler.work.ensureDue();
  const today = await scheduler.work.today({ penId: fattening.id });
  const instance = today.find((one) => one.definitionId === definitionId);
  if (!instance) {
    throw new Error("expected a weigh-in instance");
  }
  const { client: staff } = await as("staff", "2030-10-01T07:30:00.000Z");
  await staff.work.claim({ id: instance.id });
  await staff.work.completeStep({
    instanceId: instance.id,
    stepId: "weigh",
    animalTag: calfA,
    evidence: [150],
  });

  const { client: reading } = await as("owner", "2030-10-02T04:00:00.000Z");
  const { crossings } = await reading.returns.list();
  joiningA = crossings.find((one) => one.tagNumber === calfA)?.id ?? "";
  joiningB = crossings.find((one) => one.tagNumber === calfB)?.id ?? "";
});

describe("a calf walked across from Dairy joins a Season", () => {
  it("joins the next Eid's Season when no window was said, and is named, not counted, until priced", async () => {
    const { client: owner } = await as("owner", "2030-10-02T04:00:00.000Z");
    const { seasons, crossings } = await owner.returns.list();
    const eid = seasons.find((one) => one.key === "eid:2031-04-03");
    expect(eid?.head).toBe(2);
    expect(eid?.gaps).toEqual([{ tagNumber: calfA, why: "not_priced" }]);
    // Left out whole: the Season reads C alone, not lowered by her cost.
    expect(eid?.running?.low.per100).toBe(42.9);
    expect(eid?.running?.high.per100).toBe(71.4);
    expect(
      crossings
        .filter((one) => one.priceMoney === null)
        .map((one) => one.tagNumber)
        .toSorted()
    ).toEqual([calfA, calfB].toSorted());
  });

  it("is on the board, fed towards the Farm's target from the day she crossed, before anybody prices her", async () => {
    const { client: manager } = await as("manager", "2030-10-02T04:00:00.000Z");
    const board = await manager.fattening.list();
    // Crossed at 01:00 the day before: a day on feed, towards the Farm's 350 kg, from the morning's 150.
    expect(board.find((row) => row.tagNumber === calfA)).toMatchObject({
      daysOnFeed: 1,
      targetWeightKg: 350,
      latestKg: 150,
    });
  });

  it("refuses a window whose days are the wrong way round", async () => {
    const { client: manager } = await as("manager", "2030-10-02T04:00:00.000Z");
    await expect(
      manager.animals.move({
        tagNumber: calfB,
        toPenId: fatteningPenId,
        toSide: "fattening",
        targetWindow: { start: WINTER.end, end: WINTER.start },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("joins the Season of a window said when she crossed", async () => {
    const { client: owner } = await as("owner", "2030-10-02T04:00:00.000Z");
    const { seasons } = await owner.returns.list();
    expect(
      seasons.find((one) => one.key === `window:${WINTER.start}|${WINTER.end}`)
    ).toMatchObject({
      head: 1,
      gaps: [{ tagNumber: calfB, why: "not_priced" }],
    });
  });
});

describe("the Owner prices a crossing", () => {
  it("refuses one nobody has weighed", async () => {
    const { client: owner } = await as("owner", "2030-10-02T04:00:00.000Z");
    await expect(
      owner.returns.priceCrossing({
        joiningId: joiningB,
        rateMoneyPerKg: 400,
        note: `বাছুরের দর ${suffix}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "crossing_unweighed" },
    });
  });

  it("puts her in her Season at her weight that day times the rate, and a second price replaces the first", async () => {
    const { client: owner } = await as("owner", "2030-10-02T04:00:00.000Z");
    const priced = await owner.returns.priceCrossing({
      joiningId: joiningA,
      rateMoneyPerKg: 380,
      note: `প্রথম দর ${suffix}`,
    });
    expect(priced).toMatchObject({ weightKg: 150, priceMoney: 57_000 });
    await owner.returns.priceCrossing({
      joiningId: joiningA,
      rateMoneyPerKg: 400,
      note: `বাছুরের দর ${suffix}`,
    });
    const { client: reading } = await as("owner", "2030-10-02T04:00:00.000Z");
    const { seasons, crossings } = await reading.returns.list();
    const eid = seasons.find((one) => one.key === "eid:2031-04-03");
    expect(eid?.gaps).toEqual([]);
    expect(eid?.running).toMatchObject({
      standingCostMoney: 130_000,
      standingLowMoney: 175_000,
      standingHighMoney: 210_000,
      low: { per100: 34.6 },
      high: { per100: 61.5 },
    });
    // Priced, she stays on the list while she is on the Farm, so the price can be put right again.
    // The two crossed in the same instant, so they are read by tag, not by the order they came.
    const byTag = new Map(crossings.map((one) => [one.tagNumber, one]));
    expect(byTag.size).toBe(2);
    expect(byTag.get(calfA)).toMatchObject({
      priceMoney: 60_000,
      rateMoneyPerKg: 400,
    });
    expect(byTag.get(calfB)).toMatchObject({
      priceMoney: null,
      rateMoneyPerKg: null,
    });
    // Both prices stay in the trail, the second over the first.
    const trail = await scratchDb().query.auditEvent.findMany({
      where: { entity: "fattening_joining", entityId: joiningA },
      columns: { before: true, after: true },
      orderBy: { receivedAt: "asc", id: "asc" },
    });
    expect(trail).toMatchObject([
      { before: { priceMoney: null }, after: { priceMoney: 57_000 } },
      { before: { priceMoney: 57_000 }, after: { priceMoney: 60_000 } },
    ]);
  });

  it("is the Owner's alone", async () => {
    const { client: manager } = await as("manager", "2030-10-02T04:00:00.000Z");
    await expect(
      manager.returns.priceCrossing({
        joiningId: joiningA,
        rateMoneyPerKg: 400,
        note: "ম্যানেজার",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("a crossed animal's window is read as a bought one's is", () => {
  it("suggests her for sale once the window her crossing gave her opens", async () => {
    const { client: manager } = await as("manager", "2030-12-16T04:00:00.000Z");
    const suggested = await manager.readyForSale.suggestions();
    expect(suggested.find((row) => row.tagNumber === calfB)?.grounds).toContain(
      "window"
    );
  });
});

describe("an Eid announced moves a crossed animal's window with the bought ones'", () => {
  it("brings her along from the day expected to the day announced, where her joining keeps it", async () => {
    const { client: manager } = await as("manager", "2031-03-30T04:00:00.000Z");
    await manager.eidDates.announce({ day: "2031-04-04" });
    // Bull C by his Intake, calf A by her crossing; B is aimed at winter, and stays.
    expect(
      await manager.eidDates.bringAlong({ expectedDay: EID_2031.start })
    ).toMatchObject({ moved: 2 });
    const board = await manager.fattening.list();
    expect(board.find((row) => row.tagNumber === calfA)?.targetWindow).toEqual({
      start: "2031-04-04",
      end: "2031-04-06",
    });
    expect(board.find((row) => row.tagNumber === calfB)?.targetWindow).toEqual(
      WINTER
    );
  });
});

describe("a crossing nobody weighed on the day she crossed", () => {
  it("is priced from her first reading after it, so her Season can finish", async () => {
    // B would not go on the crush on the first; on the third she weighed 160 kg.
    const { client: scheduler } = await as("owner", "2030-10-03T07:30:00.000Z");
    await scheduler.work.ensureDue();
    const today = await scheduler.work.today({ penId: fatteningPenId });
    const instance = today.find((one) => one.definitionId === definitionId);
    if (!instance) {
      throw new Error("expected a weigh-in instance");
    }
    const { client: staff } = await as("staff", "2030-10-03T07:30:00.000Z");
    await staff.work.claim({ id: instance.id });
    await staff.work.completeStep({
      instanceId: instance.id,
      stepId: "weigh",
      animalTag: calfB,
      evidence: [160],
    });
    const { client: owner } = await as("owner", "2030-10-04T04:00:00.000Z");
    const priced = await owner.returns.priceCrossing({
      joiningId: joiningB,
      rateMoneyPerKg: 400,
      note: `বাছুরের দর ${suffix}`,
    });
    expect(priced).toMatchObject({ weightKg: 160, priceMoney: 64_000 });
  });
});

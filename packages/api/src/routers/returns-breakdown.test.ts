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
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

// A finished Season opened out, for the Owner judging the buying: by livestock market, by trader, by breed, by the Weight Band her
// buying weight fell in, and each animal. Every line is the Season's own sum narrowed to its animals, the dead in, and
// only ever a share — never a rate a year.
//
// Worked by hand. Eid-ul-Adha 2028 (6 May). The Farm's Rations are written for 150 to 250 kg and from 250, and one for
// anything up to 400 kg — a bull of 200 kg fell in the narrower. The first and the last are retired since. All bought
// on 1 January:
// - A, at the Gabtoli livestock market from Karim, no breed written, 200 kg, ৳1,00,000 and ৳1,000 of Market toll; sold at Eid for
//   ৳1,30,000.
// - B, at the Gabtoli livestock market from Rahim, a Sahiwal, 280 kg, ৳1,20,000; sold at Eid for ৳1,50,000.
// - C, at the farm gate from Karim, a Sahiwal, 260 kg, ৳60,000; dead on 15 February.
// A Venture bought V and W on its own Float the same day, for the same Eid. V stays the Venture's and sells at Eid for
// ৳1,50,000: in no line of the Farm's. W, weighed at 300 kg on 1 March, the Farm buys from the Venture on 2 March at
// ৳400 a kilo — ৳1,20,000 — into this Season, and sells at Eid for ৳1,40,000: +৳20,000, 16.7.
// The Season cost ৳4,01,000 and brought back ৳4,20,000: ৳19,000, 4.7 on the hundred.
// - By livestock market: Gabtoli (A, B) ৳2,21,000 → ৳2,80,000, +৳59,000, 26.7; the farm gate (C) ৳60,000 → nothing, −100; bought
//   from a Venture (W) 16.7.
// - By trader: Karim (A, C) ৳1,61,000 → ৳1,30,000, −৳31,000, −19.3; Rahim (B) ৳1,20,000 → ৳1,50,000, 25; bought from a
//   Venture (W) 16.7.
// - By breed: Sahiwal (B, C) ৳1,80,000 → ৳1,50,000, −৳30,000, −16.7; none written (A, W) ৳2,21,000 → ৳2,70,000,
//   +৳49,000, 22.2.
// - By band, W at the 300 kg she joined at: 150–250 (A) 28.7; from 250 (B, C, W) ৳3,00,000 → ৳2,90,000, −৳10,000,
//   −3.3.

const suffix = `${Date.now()}`.slice(-7);
const EID_2028 = { start: "2028-05-06", end: "2028-05-08" };
const WINTER = { start: "2028-12-15", end: "2029-01-15" };
const GABTOLI = `গাবতলী ${suffix}`;
const KARIM = `করিম ${suffix}`;
const RAHIM = `রহিম ${suffix}`;
const SAHIWAL = `শাহীওয়াল ${suffix}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const tags: Record<"a" | "b" | "c" | "w", string> = {
  a: "",
  b: "",
  c: "",
  w: "",
};
let breedId = "";

const sell = async (tagNumber: string, priceMoney: number) => {
  const { client } = await as("manager", "2028-05-06T00:00:00.000Z");
  await client.sales.record({
    tagNumber,
    buyer: { name: `কাদের কসাই ${suffix}` },
    destination: "গাবতলী পশুর হাট",
    vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৪",
    driver: "সোহেল",
    priceMoney,
    weightKg: 300,
  });
};

/** A morning's weigh-in off the crush: what an Internal Sale is priced from. */
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

/** A Venture with capital, buying on its own Float: two bulls, V and W, aimed at the same Eid as the Farm's. */
const venturesTwo = async (penId: string) => {
  const { client: owner } = await as("owner", "2027-12-31T04:00:00.000Z");
  const venture = await owner.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2028-01-10",
    targetWindowStart: EID_2028.start,
    targetWindowEnd: EID_2028.end,
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  const person = await owner.investors.record({
    name: `রফিক ${suffix}`,
    phone: "01999000077",
  });
  const agreement = await owner.ventures.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2027-12-30",
    stampSerial: `AA 1 ${suffix}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: 1_000_000,
    movedOn: "2027-12-31",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.ventures.startBuying({ id: venture.id });
  const { client: buying } = await as("owner", "2028-01-01T00:00:00.000Z");
  const trip = await buying.trips.record({
    wentTo: `ভেঞ্চারের হাট ${suffix}`,
    wentOn: "2028-01-01",
    brokerMoney: 0,
    transportMoney: 0,
    keepMoney: 0,
  });
  await buying.ventures.drawFloat({
    ventureId: venture.id,
    buyingTripId: trip.id,
    amountMoney: 200_000,
    movedOn: "2028-01-01",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const { client: manager } = await as("manager", "2028-01-01T00:00:00.000Z");
  const bull = async () =>
    await manager.intakes.record({
      penId,
      sex: "male",
      seller: { name: `ভেঞ্চারের ব্যাপারী ${suffix}` },
      purchasePriceMoney: 100_000,
      weightKg: 240,
      estimatedAgeMonths: 20,
      buyingTripId: trip.id,
      ventureId: venture.id,
      arrivedAt: new Date("2028-01-01T00:00:00Z"),
      targetWindowStart: EID_2028.start,
      targetWindowEnd: EID_2028.end,
    });
  const v = await bull();
  const w = await bull();
  await buying.ventures.reconcileFloat({
    buyingTripId: trip.id,
    cashBackMoney: 0,
    movedOn: "2028-01-01",
    reference: `DEP-${suffix}`,
  });
  return { v: v.tagNumber, w: w.tagNumber };
};

beforeAll(async () => {
  const { client: owner } = await as("owner", "2027-12-31T04:00:00.000Z");
  const shed = await owner.herd.createShed({ name: `ভাগ ${suffix}` });
  const pen = await owner.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `মোটাতাজা ${suffix}`,
  });
  const straw = await owner.feed.addItem({ name: { bn: `খড় ${suffix}` } });
  const ration = async (
    name: string,
    band: { fromKg: number | null; toKg: number | null }
  ) =>
    await owner.feed.saveRation({
      name: { bn: `${name} ${suffix}` },
      items: [{ feedItemId: straw.id, kgPer100KgPerDay: 1 }],
      band,
    });
  const grower = await ration("গ্রোয়ার", { fromKg: 150, toKg: 250 });
  await ration("ফিনিশার", { fromKg: 250, toKg: null });
  const old = await ration("পুরনো", { fromKg: null, toKg: 400 });
  await owner.feed.retireRation({ id: old.rationId });
  // Put away since, as a farm's Rations are: the weight A was bought at still fell in its band.
  await owner.feed.retireRation({ id: grower.rationId });
  // The crush is in this Pen, so the person reading the scale has to be assigned to it.
  await as("staff", "2027-12-31T04:00:00.000Z");
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-${suffix}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const { definitionId } = await owner.sops.create({ content: weighInSop() });
  const breed = await owner.breeds.add({ nameBn: SAHIWAL });
  breedId = breed.id;
  const { client: onTheDay } = await as("owner", "2028-01-01T00:00:00.000Z");
  const trip = await onTheDay.trips.record({
    wentTo: GABTOLI,
    wentOn: "2028-01-01",
    brokerMoney: 0,
    transportMoney: 0,
    keepMoney: 0,
  });

  const { client: manager } = await as("manager", "2028-01-01T00:00:00.000Z");
  const bought = async (one: {
    seller: string;
    purchasePriceMoney: number;
    marketTollMoney?: number;
    weightKg: number;
    atGabtoli: boolean;
    sahiwal: boolean;
    window?: { start: string; end: string };
  }) => {
    const window = one.window ?? EID_2028;
    const intake = await manager.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: one.seller },
      purchasePriceMoney: one.purchasePriceMoney,
      marketTollMoney: one.marketTollMoney ?? 0,
      weightKg: one.weightKg,
      estimatedAgeMonths: 20,
      arrivedAt: new Date("2028-01-01T00:00:00Z"),
      targetWindowStart: window.start,
      targetWindowEnd: window.end,
      ...(one.atGabtoli ? { buyingTripId: trip.id } : {}),
      ...(one.sahiwal ? { breedId } : {}),
    });
    return intake.tagNumber;
  };
  tags.a = await bought({
    seller: KARIM,
    purchasePriceMoney: 100_000,
    marketTollMoney: 1000,
    weightKg: 200,
    atGabtoli: true,
    sahiwal: false,
  });
  tags.b = await bought({
    seller: RAHIM,
    purchasePriceMoney: 120_000,
    weightKg: 280,
    atGabtoli: true,
    sahiwal: true,
  });
  tags.c = await bought({
    seller: KARIM,
    purchasePriceMoney: 60_000,
    weightKg: 260,
    atGabtoli: false,
    sahiwal: true,
  });
  // A bull for a winter market, still standing when the Eid Season is read: a Season not yet a result.
  await bought({
    seller: RAHIM,
    purchasePriceMoney: 90_000,
    weightKg: 220,
    atGabtoli: false,
    sahiwal: false,
    window: WINTER,
  });

  const { client: finding } = await as("manager", "2028-02-15T06:00:00.000Z");
  await finding.animals.recordMortality({
    photo: A_DEATH_PHOTO,
    tagNumber: tags.c,
    kind: "died",
    cause: "পেট ফুলে গিয়েছিল",
    disposal: "buried",
    happenedAt: new Date("2028-02-15T00:00:00Z"),
  });

  // The Venture's two, and W bought by the Farm off the morning's scale.
  const theirs = await venturesTwo(pen.id);
  tags.w = theirs.w;
  const { client: scheduler } = await as("owner", "2028-03-01T07:30:00.000Z");
  await scheduler.instances.ensureDue();
  const today = await scheduler.instances.today({ penId: pen.id });
  const round = today.find((one) => one.definitionId === definitionId);
  if (!round) {
    throw new Error("expected a weigh-in instance");
  }
  const { client: staff } = await as("staff", "2028-03-01T07:30:00.000Z");
  await staff.instances.claim({ id: round.id });
  await staff.instances.completeStep({
    instanceId: round.id,
    stepId: "weigh",
    animalTag: tags.w,
    evidence: [300],
  });
  const { client: takingOn } = await as("owner", "2028-03-02T04:00:00.000Z");
  await takingOn.ventures.sellInternally({
    tagNumber: tags.w,
    rateMoneyPerKg: 400,
    note: `হাটের দর ${suffix}`,
    soldOn: "2028-03-02",
    paymentMethod: "bank",
    reference: `INT-${suffix}`,
    priceMoney: 120_000,
    targetWindow: EID_2028,
  });

  await sell(tags.a, 130_000);
  await sell(tags.b, 150_000);
  await sell(theirs.v, 150_000);
  await sell(tags.w, 140_000);
});

type By = "livestockMarket" | "trader" | "breed" | "band" | "animal";

const breakdown = async (by: By, seasonKey = "eid:2028-05-06") => {
  const { client: owner } = await as("owner", "2028-06-01T04:00:00.000Z");
  return await owner.returns.breakdown({ seasonKey, by });
};

/** One Animal's line as the breakdown reads it: how she came and left, her cost, what came back, her share. */
const animalRow = (
  tagNumber: string,
  came: "intake" | "bought_from_venture",
  since: string,
  left: "sold" | "died",
  costMoney: number,
  backMoney: number,
  per100: number
) => ({
  line: { kind: "animal", tagNumber, came, since, left },
  costMoney,
  backMoney,
  per100,
});

describe("a finished Season opened out", () => {
  it("by livestock market: her Buying Trip's livestock market, and the farm gate for one bought on none", async () => {
    expect(await breakdown("livestockMarket")).toEqual([
      {
        line: { kind: "named", id: GABTOLI, name: GABTOLI, nameEn: null },
        head: 2,
        died: 0,
        lost: 0,
        costMoney: 221_000,
        backMoney: 280_000,
        resultMoney: 59_000,
        per100: 26.7,
      },
      {
        line: { kind: "none" },
        head: 1,
        died: 1,
        lost: 0,
        costMoney: 60_000,
        backMoney: 0,
        resultMoney: -60_000,
        per100: -100,
      },
      {
        line: { kind: "bought_from_venture" },
        head: 1,
        died: 0,
        lost: 0,
        costMoney: 120_000,
        backMoney: 140_000,
        resultMoney: 20_000,
        per100: 16.7,
      },
    ]);
  });

  it("by trader: the Intake's seller, the dead one in his line", async () => {
    const lines = await breakdown("trader");
    expect(
      lines.map(({ line, died, per100 }) => ({
        name: line.kind === "named" ? line.name : line.kind,
        died,
        per100,
      }))
    ).toEqual([
      { name: KARIM, died: 1, per100: -19.3 },
      { name: RAHIM, died: 0, per100: 25 },
      { name: "bought_from_venture", died: 0, per100: 16.7 },
    ]);
  });

  it("by breed, one with none written in a line of her own", async () => {
    const lines = await breakdown("breed");
    expect(lines).toMatchObject([
      {
        line: { kind: "named", id: breedId, name: SAHIWAL },
        head: 2,
        died: 1,
        costMoney: 180_000,
        resultMoney: -30_000,
        per100: -16.7,
      },
      {
        line: { kind: "none" },
        head: 2,
        costMoney: 221_000,
        resultMoney: 49_000,
        per100: 22.2,
      },
    ]);
  });

  it("by the Weight Band her buying weight fell in", async () => {
    const lines = await breakdown("band");
    expect(
      lines.map(({ line, head, died, per100 }) => ({
        line,
        head,
        died,
        per100,
      }))
    ).toEqual([
      {
        line: { kind: "band", fromKg: 150, toKg: 250 },
        head: 1,
        died: 0,
        per100: 28.7,
      },
      {
        line: { kind: "band", fromKg: 250, toKg: null },
        head: 3,
        died: 1,
        per100: -3.3,
      },
    ]);
  });

  it("into each animal: how she came, her cost, what came back, and her share", async () => {
    const lines = await breakdown("animal");
    expect(
      lines.map(({ line, costMoney, backMoney, per100 }) => ({
        line,
        costMoney,
        backMoney,
        per100,
      }))
    ).toEqual(
      [
        animalRow(
          tags.a,
          "intake",
          "2028-01-01",
          "sold",
          101_000,
          130_000,
          28.7
        ),
        animalRow(tags.b, "intake", "2028-01-01", "sold", 120_000, 150_000, 25),
        animalRow(tags.c, "intake", "2028-01-01", "died", 60_000, 0, -100),
        // W, from the day the Farm took her on: her months as the Venture's are the Venture's.
        animalRow(
          tags.w,
          "bought_from_venture",
          "2028-03-02",
          "sold",
          120_000,
          140_000,
          16.7
        ),
      ].toSorted((x, y) => x.line.tagNumber.localeCompare(y.line.tagNumber))
    );
  });

  it("adds up, every way it is opened, to the Season's own cost and result", async () => {
    const { client: owner } = await as("owner", "2028-06-01T04:00:00.000Z");
    const { seasons } = await owner.returns.page();
    const season = seasons.find((one) => one.key === "eid:2028-05-06");
    // Four head: the Venture's own V, sold in the same window, is in no line of the Farm's.
    expect(season?.head).toBe(4);
    expect(season?.returnOnCost).toMatchObject({
      costMoney: 401_000,
      resultMoney: 19_000,
    });
    for (const by of [
      "livestockMarket",
      "trader",
      "breed",
      "band",
      "animal",
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- five ways, read one after the other
      const lines = await breakdown(by);
      expect({
        by,
        costMoney: lines.reduce((sum, one) => sum + one.costMoney, 0),
        resultMoney: lines.reduce((sum, one) => sum + one.resultMoney, 0),
      }).toEqual({ by, costMoney: 401_000, resultMoney: 19_000 });
    }
  });

  it("says a share on every line, and never a rate a year", async () => {
    for (const by of [
      "livestockMarket",
      "trader",
      "breed",
      "band",
      "animal",
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- five ways, read one after the other
      const lines = await breakdown(by);
      for (const one of lines) {
        expect(one).not.toHaveProperty("perYear");
        expect(one).not.toHaveProperty("averageDays");
      }
    }
  });
});

describe("what cannot be opened", () => {
  it("refuses a Season still going: it is no result to judge the buying by", async () => {
    await expect(
      breakdown("livestockMarket", `window:${WINTER.start}|${WINTER.end}`)
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "season_not_finished" },
    });
  });

  it("says there is no such Season", async () => {
    await expect(
      breakdown("livestockMarket", "eid:1999-01-01")
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is the Owner's alone", async () => {
    const { client: manager } = await as("manager", "2028-06-01T04:00:00.000Z");
    await expect(
      manager.returns.breakdown({
        seasonKey: "eid:2028-05-06",
        by: "livestockMarket",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

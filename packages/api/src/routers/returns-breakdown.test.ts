import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A finished Season opened out, for the Owner judging the buying: by haat, by trader, by breed, by the Weight Band her
// buying weight fell in, and each animal. Every line is the Season's own sum narrowed to its animals, the dead in, and
// only ever a share — never a rate a year.
//
// Worked by hand. Eid-ul-Adha 2028 (6 May). The Farm's Rations are written for 150 to 250 kg and from 250. All bought on
// 1 January:
// - A, at the Gabtoli haat from Karim, no breed written, 200 kg, ৳1,00,000 and ৳1,000 of Hasil; sold at Eid for
//   ৳1,30,000.
// - B, at the Gabtoli haat from Rahim, a Sahiwal, 280 kg, ৳1,20,000; sold at Eid for ৳1,50,000.
// - C, at the farm gate from Karim, a Sahiwal, 260 kg, ৳60,000; dead on 15 February.
// The Season cost ৳2,81,000 and brought back ৳2,80,000: ৳1,000 lost, 0.4 below nothing on the hundred.
// - By haat: Gabtoli (A, B) ৳2,21,000 → ৳2,80,000, +৳59,000, 26.7; the farm gate (C) ৳60,000 → nothing, −100.
// - By trader: Karim (A, C) ৳1,61,000 → ৳1,30,000, −৳31,000, −19.3; Rahim (B) ৳1,20,000 → ৳1,50,000, 25.
// - By breed: Sahiwal (B, C) ৳1,80,000 → ৳1,50,000, −৳30,000, −16.7; none written (A) ৳1,01,000 → ৳1,30,000, 28.7.
// - By band: 150–250 (A) 28.7; from 250 (B, C) −16.7.

const suffix = `${Date.now()}`.slice(-7);
const EID_2028 = { start: "2028-05-06", end: "2028-05-08" };
const WINTER = { start: "2028-12-15", end: "2029-01-15" };
const GABTOLI = `গাবতলী ${suffix}`;
const KARIM = `করিম ${suffix}`;
const RAHIM = `রহিম ${suffix}`;
const SAHIWAL = `শাহীওয়াল ${suffix}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const tags: Record<"a" | "b" | "c", string> = { a: "", b: "", c: "" };
let breedId = "";

const sell = async (tagNumber: string, priceBdt: number) => {
  const { client } = await as("manager", "2028-05-06T00:00:00.000Z");
  await client.sale.record({
    tagNumber,
    buyer: { name: `কাদের কসাই ${suffix}` },
    destination: "গাবতলী পশুর হাট",
    vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৪",
    driver: "সোহেল",
    priceBdt,
    weightKg: 300,
  });
};

beforeAll(async () => {
  const { client: owner } = await as("owner", "2027-12-31T04:00:00.000Z");
  const shed = await owner.herd.createShed({ name: `ভাগ ${suffix}` });
  const pen = await owner.herd.createPen({
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
  await ration("গ্রোয়ার", { fromKg: 150, toKg: 250 });
  await ration("ফিনিশার", { fromKg: 250, toKg: null });
  const breed = await owner.breeds.add({ nameBn: SAHIWAL });
  breedId = breed.id;
  const { client: onTheDay } = await as("owner", "2028-01-01T00:00:00.000Z");
  const trip = await onTheDay.trips.record({
    wentTo: GABTOLI,
    wentOn: "2028-01-01",
    brokerBdt: 0,
    transportBdt: 0,
    keepBdt: 0,
  });

  const { client: manager } = await as("manager", "2028-01-01T00:00:00.000Z");
  const bought = async (one: {
    seller: string;
    purchasePriceBdt: number;
    hasilBdt?: number;
    weightKg: number;
    atGabtoli: boolean;
    sahiwal: boolean;
    window?: { start: string; end: string };
  }) => {
    const window = one.window ?? EID_2028;
    const intake = await manager.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: one.seller },
      purchasePriceBdt: one.purchasePriceBdt,
      hasilBdt: one.hasilBdt ?? 0,
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
    purchasePriceBdt: 100_000,
    hasilBdt: 1000,
    weightKg: 200,
    atGabtoli: true,
    sahiwal: false,
  });
  tags.b = await bought({
    seller: RAHIM,
    purchasePriceBdt: 120_000,
    weightKg: 280,
    atGabtoli: true,
    sahiwal: true,
  });
  tags.c = await bought({
    seller: KARIM,
    purchasePriceBdt: 60_000,
    weightKg: 260,
    atGabtoli: false,
    sahiwal: true,
  });
  // A bull for a winter market, still standing when the Eid Season is read: a Season not yet a result.
  await bought({
    seller: RAHIM,
    purchasePriceBdt: 90_000,
    weightKg: 220,
    atGabtoli: false,
    sahiwal: false,
    window: WINTER,
  });

  const { client: finding } = await as("manager", "2028-02-15T06:00:00.000Z");
  await finding.animals.recordMortality({
    tagNumber: tags.c,
    kind: "died",
    cause: "পেট ফুলে গিয়েছিল",
    disposal: "buried",
    happenedAt: new Date("2028-02-15T00:00:00Z"),
  });
  await sell(tags.a, 130_000);
  await sell(tags.b, 150_000);
});

type By = "haat" | "trader" | "breed" | "band" | "animal";

const breakdown = async (by: By, seasonKey = "eid:2028-05-06") => {
  const { client: owner } = await as("owner", "2028-06-01T04:00:00.000Z");
  return await owner.returns.breakdown({ seasonKey, by });
};

describe("a finished Season opened out", () => {
  it("by haat: her Buying Trip's haat, and the farm gate for one bought on none", async () => {
    expect(await breakdown("haat")).toEqual([
      {
        line: { kind: "named", id: GABTOLI, name: GABTOLI, nameEn: null },
        head: 2,
        died: 0,
        costBdt: 221_000,
        backBdt: 280_000,
        resultBdt: 59_000,
        per100: 26.7,
      },
      {
        line: { kind: "none" },
        head: 1,
        died: 1,
        costBdt: 60_000,
        backBdt: 0,
        resultBdt: -60_000,
        per100: -100,
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
    ]);
  });

  it("by breed, one with none written in a line of her own", async () => {
    const lines = await breakdown("breed");
    expect(lines).toMatchObject([
      {
        line: { kind: "named", id: breedId, name: SAHIWAL },
        head: 2,
        died: 1,
        costBdt: 180_000,
        resultBdt: -30_000,
        per100: -16.7,
      },
      {
        line: { kind: "none" },
        head: 1,
        costBdt: 101_000,
        resultBdt: 29_000,
        per100: 28.7,
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
        head: 2,
        died: 1,
        per100: -16.7,
      },
    ]);
  });

  it("into each animal: her cost, what came back, and her share", async () => {
    const lines = await breakdown("animal");
    expect(
      lines.map(({ line, costBdt, backBdt, per100 }) => ({
        line,
        costBdt,
        backBdt,
        per100,
      }))
    ).toEqual([
      {
        line: {
          kind: "animal",
          tagNumber: tags.a,
          came: "intake",
          left: "sold",
        },
        costBdt: 101_000,
        backBdt: 130_000,
        per100: 28.7,
      },
      {
        line: {
          kind: "animal",
          tagNumber: tags.b,
          came: "intake",
          left: "sold",
        },
        costBdt: 120_000,
        backBdt: 150_000,
        per100: 25,
      },
      {
        line: {
          kind: "animal",
          tagNumber: tags.c,
          came: "intake",
          left: "died",
        },
        costBdt: 60_000,
        backBdt: 0,
        per100: -100,
      },
    ]);
  });

  it("adds up, every way it is opened, to the Season's own cost and result", async () => {
    const { client: owner } = await as("owner", "2028-06-01T04:00:00.000Z");
    const { seasons } = await owner.returns.page();
    const season = seasons.find((one) => one.key === "eid:2028-05-06");
    expect(season?.returnOnCost).toMatchObject({
      costBdt: 281_000,
      resultBdt: -1000,
    });
    for (const by of ["haat", "trader", "breed", "band", "animal"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- five ways, read one after the other
      const lines = await breakdown(by);
      expect({
        by,
        costBdt: lines.reduce((sum, one) => sum + one.costBdt, 0),
        resultBdt: lines.reduce((sum, one) => sum + one.resultBdt, 0),
      }).toEqual({ by, costBdt: 281_000, resultBdt: -1000 });
    }
  });

  it("says a share on every line, and never a rate a year", async () => {
    for (const by of ["haat", "trader", "breed", "band", "animal"] as const) {
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
      breakdown("haat", `window:${WINTER.start}|${WINTER.end}`)
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "season_not_finished" },
    });
  });

  it("says there is no such Season", async () => {
    await expect(breakdown("haat", "eid:1999-01-01")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is the Owner's alone", async () => {
    const { client: manager } = await as("manager", "2028-06-01T04:00:00.000Z");
    await expect(
      manager.returns.breakdown({ seasonKey: "eid:2028-05-06", by: "haat" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

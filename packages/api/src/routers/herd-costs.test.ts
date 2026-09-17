import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Herd Costs: money the farm spends on the animals that names none of them — a Vet's visit to the pens that
 * named nobody, lab tests, fly spray. The Owner marks the Category once, and the month's money is split
 * across the Animals of that Side by the days each stood here.
 */
const suffix = `herd-${Date.now()}`;
const MARCH = { from: "2043-03-01", to: "2043-03-31" };
const WINDOW = {
  targetWindowStart: "2043-06-01",
  targetWindowEnd: "2043-06-05",
};

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let penId = "";
let sprayId = "";
let bitsId = "";
/** The bull the first test buys, who is standing here for the rest of them. */
let first = "";

const buy = async (instant: string, arrivedAt: string) => {
  const manager = await as("manager", instant);
  const taken = await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 50_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(arrivedAt),
    ...WINDOW,
  });
  return taken.tagNumber;
};

const spend = async (
  instant: string,
  categoryId: string,
  amountBdt: number,
  occurredOn: string
) => {
  const manager = await as("manager", instant);
  return await manager.client.money.enter({
    categoryId,
    amountBdt,
    occurredOn,
    counterparty: { name: `দোকান ${suffix}` },
    paymentMethod: "cash",
    side: "fattening",
    note: `${suffix}`,
  });
};

const costOf = async (tagNumber: string) => {
  const owner = await as("owner", "2043-04-05T04:00:00.000Z");
  return await owner.client.costs.ofAnimal({ tagNumber });
};

beforeAll(async () => {
  const owner = await as("owner", "2043-03-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "ফ্যাটেনিং",
  });
  penId = pen.id;
  const spray = await owner.client.money.addCategory({
    nameBn: `মাছি স্প্রে ${suffix}`,
    direction: "out",
  });
  sprayId = spray.id;
  const bits = await owner.client.money.addCategory({
    nameBn: `টুকিটাকি ${suffix}`,
    direction: "out",
  });
  bitsId = bits.id;
  first = await buy("2043-03-01T05:00:00.000Z", "2043-03-01T05:00:00Z");
});

describe("Herd Costs", () => {
  it("reaches nobody while the Owner has not marked the Category", async () => {
    await spend("2043-03-10T04:00:00.000Z", bitsId, 3000, "2043-03-10");
    expect(await costOf(first)).toMatchObject({ herdBdt: 0 });
  });

  it("splits a marked Category's month by the days each animal stood here", async () => {
    const owner = await as("owner", "2043-03-02T04:00:00.000Z");
    await owner.client.money.setChargedToAnimals({
      categoryId: sprayId,
      chargedToAnimals: true,
    });
    // One bull all March; one who came on the 16th, so half the month.
    const allMonth = await buy(
      "2043-03-01T06:00:00.000Z",
      "2043-03-01T00:00:00Z"
    );
    const halfMonth = await buy(
      "2043-03-16T06:00:00.000Z",
      "2043-03-16T00:00:00Z"
    );
    await spend("2043-03-20T04:00:00.000Z", sprayId, 9000, "2043-03-20");

    const early = await costOf(allMonth);
    const late = await costOf(halfMonth);
    const alsoHere = await costOf(first);
    // Everything spent that month reaches the animals of that Side — these three — and nothing is lost
    // between them.
    expect(early.herdBdt + late.herdBdt + alsoHere.herdBdt).toBeCloseTo(
      9000,
      0
    );
    // The ones who stood here all month carry about twice what the one who came on the 16th carries.
    expect(early.herdBdt).toBeGreaterThan(late.herdBdt * 1.5);
    // The two who stood here all month carry all but the hours between their arrivals apart.
    expect(Math.abs(early.herdBdt - alsoHere.herdBdt)).toBeLessThan(20);
  });

  it("comes off her Margin and her Cost of Gain", async () => {
    const owner = await as("owner", "2043-04-05T04:00:00.000Z");
    const report = await owner.client.costs.bySide({
      from: "2043-03-01",
      to: "2043-03-31",
    });
    expect(report.fattening.herdBdt).toBeGreaterThan(0);

    // And on the animal herself: what she carries of the month comes off what she made.
    const sold = await buy("2043-03-02T06:00:00.000Z", "2043-03-02T00:00:00Z");
    const selling = await as("manager", "2043-03-28T06:00:00.000Z");
    await selling.client.sale.record({
      tagNumber: sold,
      buyer: { name: `ক্রেতা ${suffix}` },
      priceBdt: 90_000,
      weightKg: 300,
      destination: "ঢাকা",
      vehicle: "ঢাকা মেট্রো ট-১১-৯৯৯৯",
      driver: "রফিক",
      paymentMethod: "cash",
    });
    const hers = await costOf(sold);
    expect(hers.herdBdt).toBeGreaterThan(0);
    // Ninety thousand, less the fifty she cost and everything charged to her, herd costs included.
    expect(hers.marginBdt).toBeCloseTo(
      90_000 -
        50_000 -
        (hers.feedBdt +
          hers.medicineBdt +
          hers.vetBdt +
          hers.hasilBdt +
          hers.tripBdt +
          hers.herdBdt),
      0
    );
  });

  it("charges nothing to an animal who had gone before the month", async () => {
    // She sold in March; April's fly spray is nothing to do with her.
    const gone = await buy("2043-03-04T06:00:00.000Z", "2043-03-04T00:00:00Z");
    const selling = await as("manager", "2043-03-29T06:00:00.000Z");
    await selling.client.sale.record({
      tagNumber: gone,
      buyer: { name: `আরেক ক্রেতা ${suffix}` },
      priceBdt: 88_000,
      weightKg: 295,
      destination: "ঢাকা",
      vehicle: "ঢাকা মেট্রো ট-১১-৮৮৮৮",
      driver: "সবুজ",
      paymentMethod: "cash",
    });
    const before = await costOf(gone);
    await spend("2043-04-04T04:00:00.000Z", sprayId, 4000, "2043-04-04");
    const after = await costOf(gone);
    expect(after.herdBdt).toBeCloseTo(before.herdBdt, 2);
  });

  it("starts every standard Category unmarked", async () => {
    const owner = await as("owner", "2043-03-02T04:00:00.000Z");
    const categories = await owner.client.money.categories();
    const standard = categories.filter((one) => one.key !== null);
    expect(standard.length).toBeGreaterThan(0);
    expect(standard.every((one) => !one.chargedToAnimals)).toBe(true);
    // And wages, utilities and repairs may not even be marked: they are the place and the people.
    const wages = categories.find((one) => one.key === "wages");
    await expect(
      owner.client.money.setChargedToAnimals({
        categoryId: wages?.id ?? "",
        chargedToAnimals: true,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("charges a month with nobody standing to nobody, and says so", async () => {
    // February: the pens were empty, and the fly spray was bought all the same.
    await spend("2043-02-10T04:00:00.000Z", sprayId, 1200, "2043-02-10");
    const owner = await as("owner", "2043-04-05T04:00:00.000Z");
    const february = await owner.client.costs.bySide({
      from: "2043-02-01",
      to: "2043-02-28",
    });
    expect(february.fattening.herdBdt).toBe(0);
    expect(february.unallocated.herdBdt).toBeGreaterThanOrEqual(1200);
  });

  // A month added to the 31st of January lands on the 3rd of March, which once let February swallow the
  // animals standing in March. Months are counted, not added — so a beast carries the month she was here
  // for and not the one before it, at the turn of the year as anywhere else.
  it("charges a newcomer the month she arrived in, and not the month before", async () => {
    const owner = await as("owner", "2044-01-20T04:00:00.000Z");
    const winter = await owner.client.money.addCategory({
      nameBn: `শীতের খরচ ${suffix}`,
      direction: "out",
    });
    await owner.client.money.setChargedToAnimals({
      categoryId: winter.id,
      chargedToAnimals: true,
    });
    const newcomer = await buy(
      "2044-01-20T05:00:00.000Z",
      "2044-01-20T00:00:00Z"
    );

    // Money of the December before she came: not hers, however the months are counted.
    await spend("2044-01-02T04:00:00.000Z", winter.id, 1000, "2043-12-31");
    const reader = await as("owner", "2044-02-02T04:00:00.000Z");
    const afterDecember = await reader.client.costs.ofAnimal({
      tagNumber: newcomer,
    });
    expect(afterDecember.herdBdt).toBe(0);

    // Money of the January she stood in: hers, with the others who were here.
    await spend("2044-01-31T04:00:00.000Z", winter.id, 2000, "2044-01-31");
    const afterJanuary = await reader.client.costs.ofAnimal({
      tagNumber: newcomer,
    });
    expect(afterJanuary.herdBdt).toBeGreaterThan(0);
  });

  it("is the Owner's alone to mark", async () => {
    const manager = await as("manager", "2043-03-03T04:00:00.000Z");
    await expect(
      manager.client.money.setChargedToAnimals({
        categoryId: bitsId,
        chargedToAnimals: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reaches nobody when the money names no Side", async () => {
    const manager = await as("manager", "2043-03-25T04:00:00.000Z");
    await manager.client.money.enter({
      categoryId: sprayId,
      amountBdt: 500,
      occurredOn: "2043-03-25",
      counterparty: { name: `দোকান ${suffix}` },
      paymentMethod: "cash",
      note: `whole farm ${suffix}`,
    });
    const owner = await as("owner", "2043-04-05T04:00:00.000Z");
    const report = await owner.client.costs.bySide(MARCH);
    // The 9,000 of March reached the animals; this 500 belongs to no Side and reaches nobody.
    expect(report.fattening.herdBdt).toBeCloseTo(9000, 0);
  });
});

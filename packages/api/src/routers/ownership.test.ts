import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Whose animal she is, and whose money bought her: an Intake names its owner — a Venture, or the Farm —
 * and the Money Event it books lands in that owner's Purse.
 */
const suffix = `owned-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const PERIOD = { from: "2046-11-01", to: "2046-11-30" };
const WINDOW = {
  targetWindowStart: "2047-05-17",
  targetWindowEnd: "2047-05-19",
};

let penId = "";
let ventureId = "";
let stillOpenId = "";

/** One bull off the lorry, for a Venture or for the Farm. */
const buy = async (
  instant: string,
  priceBdt: number,
  ventureFor?: string,
  arrivedAt = instant
) => {
  // A Venture's bull at the gate is the Owner's, paid from its account by bank.
  const manager = await as(ventureFor ? "owner" : "manager", instant);
  return await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: priceBdt,
    hasilBdt: 1000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(arrivedAt),
    ventureId: ventureFor,
    ...(ventureFor ? PAID_FROM_THE_ACCOUNT : {}),
    ...WINDOW,
  });
};

/** What making a bull at the gate a Venture's asks besides her owner: the Venture Account paid for her by bank. */
const PAID_BY_THE_VENTURE = {
  paymentMethod: { from: "cash", to: "bank" },
  reference: { from: null, to: "TRF ভেঞ্চারের হিসাব থেকে" },
} as const;

beforeAll(async () => {
  const owner = await as("owner", "2046-11-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;

  const plan = {
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2046-11-20",
    targetWindowStart: "2047-05-17",
    targetWindowEnd: "2047-05-19",
    unitPriceBdt: 50_000,
    units: 20,
  };
  const buying = await owner.client.ventures.open({
    name: `কিনছে ${suffix}`,
    ...plan,
  });
  // Capital in first: a bull at the gate is paid from what the account holds.
  await putCapitalIn(
    owner.client,
    { id: buying.id, units: 20, unitPriceBdt: 50_000 },
    `buying ${suffix}`,
    "2046-11-01"
  );
  await owner.client.ventures.startBuying({ id: buying.id });
  ventureId = buying.id;
  const open = await owner.client.ventures.open({
    name: `এখনো খোলা ${suffix}`,
    ...plan,
  });
  stillOpenId = open.id;
});

describe("whose animal she is", () => {
  it("is the Farm's when the Intake names nobody", async () => {
    const owner = await as("owner", "2046-11-02T06:00:00.000Z");
    const hers = await buy("2046-11-02T05:00:00.000Z", 60_000);
    const her = await owner.client.animals.byTag({ tagNumber: hers.tagNumber });
    expect(her.owner).toBeNull();
    // And her cost is the Farm's, as every animal's has been until now.
    const money = await owner.client.money.list(PERIOD);
    const bought = money.events.find((one) => one.sourceId === hers.intakeId);
    expect(bought).toMatchObject({ amountBdt: 61_000, purse: null });
  });

  it("is the Venture's when the Intake names one, and so is what she cost", async () => {
    const owner = await as("owner", "2046-11-03T06:00:00.000Z");
    const theirs = await buy("2046-11-03T05:00:00.000Z", 80_000, ventureId);
    const her = await owner.client.animals.byTag({
      tagNumber: theirs.tagNumber,
    });
    expect(her.owner).toMatchObject({
      id: ventureId,
      name: `কিনছে ${suffix}`,
    });

    // Eighty-one thousand taka of a Venture's money, and not a taka of it in the Farm's register.
    const theFarms = await owner.client.money.list(PERIOD);
    expect(theFarms.events.map((one) => one.sourceId)).not.toContain(
      theirs.intakeId
    );
    const itsOwn = await owner.client.money.list({ ...PERIOD, ventureId });
    expect(
      itsOwn.events.find((one) => one.sourceId === theirs.intakeId)
    ).toMatchObject({ amountBdt: 81_000 });
  });

  it("refuses a Venture that has not started buying, and one that is not this farm's", async () => {
    await expect(
      buy("2046-11-04T05:00:00.000Z", 50_000, stillOpenId)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      buy("2046-11-04T05:30:00.000Z", 50_000, `no-such-venture-${suffix}`)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is put right inside the Correction Window, and her money with it", async () => {
    const slip = await buy("2046-11-05T05:00:00.000Z", 70_000);
    // The Owner's, paid from the Venture Account by bank.
    const manager = await as("owner", "2046-11-05T09:00:00.000Z");
    await manager.client.intake.correct({
      id: slip.intakeId,
      reason: "ভেঞ্চারের গরু, ভুল করে খামারের নামে লেখা হয়েছিল",
      changes: { owner: { from: null, to: ventureId }, ...PAID_BY_THE_VENTURE },
    });
    const owner = await as("owner", "2046-11-05T10:00:00.000Z");
    const her = await owner.client.animals.byTag({ tagNumber: slip.tagNumber });
    expect(her.owner).toMatchObject({ id: ventureId });
    // The one Money Event moved purses with her; the Farm's register is rid of it.
    const theFarms = await owner.client.money.list(PERIOD);
    expect(theFarms.events.map((one) => one.sourceId)).not.toContain(
      slip.intakeId
    );
    const itsOwn = await owner.client.money.list({ ...PERIOD, ventureId });
    expect(itsOwn.events.map((one) => one.sourceId)).toContain(slip.intakeId);
  });

  it("is not put right once the window has closed", async () => {
    const old = await buy("2046-11-06T05:00:00.000Z", 70_000);
    // Five weeks later, past the thirty days the Manager's window gives her.
    const manager = await as("manager", "2046-12-12T05:00:00.000Z");
    await expect(
      manager.client.intake.correct({
        id: old.intakeId,
        reason: "অনেক দেরিতে",
        changes: { owner: { from: null, to: ventureId } },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not let her drift across to the dairy side", async () => {
    const owner = await as("owner", "2046-11-10T04:00:00.000Z");
    const theirs = await buy("2046-11-10T05:00:00.000Z", 60_000, ventureId);
    const dairyShed = await owner.client.herd.createShed({
      name: `দুধ ${suffix}`,
    });
    const dairyPen = await owner.client.herd.createPen({
      shedId: dairyShed.id,
      name: `দুধের ঘর ${suffix}`,
    });
    const manager = await as("manager", "2046-11-10T06:00:00.000Z");
    // Walking her across would make her a Dairy cow an Investor owns, and would change whose she is
    // without anybody selling her.
    await expect(
      manager.client.animals.move({
        tagNumber: theirs.tagNumber,
        toPenId: dairyPen.id,
        toSide: "dairy",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is still put right after the Venture has moved on to fattening", async () => {
    const owner = await as("owner", "2046-11-11T04:00:00.000Z");
    const movedOn = await owner.client.ventures.open({
      name: `মোটাতাজা ${suffix}`,
      targetCapitalBdt: 1_000_000,
      floorBdt: 0,
      decideBy: "2046-11-20",
      targetWindowStart: "2047-05-17",
      targetWindowEnd: "2047-05-19",
      unitPriceBdt: 50_000,
      units: 20,
    });
    // Capital in first: a bull at the gate is paid from what the account holds.
    await putCapitalIn(
      owner.client,
      { id: movedOn.id, units: 20, unitPriceBdt: 50_000 },
      `movedOn ${suffix}`,
      "2046-11-11"
    );
    await owner.client.ventures.startBuying({ id: movedOn.id });
    const slip = await buy("2046-11-11T05:00:00.000Z", 60_000);
    await owner.client.ventures.startFattening({ id: movedOn.id });
    const manager = await as("owner", "2046-11-11T07:00:00.000Z");
    // The Correction Window is thirty days and a Venture does not wait that long: a slip at the haat
    // is still a slip once buying has finished.
    await manager.client.intake.correct({
      id: slip.intakeId,
      reason: "ভেঞ্চারের গরু ছিল",
      changes: {
        owner: { from: null, to: movedOn.id },
        ...PAID_BY_THE_VENTURE,
      },
    });
    const her = await owner.client.animals.byTag({ tagNumber: slip.tagNumber });
    expect(her.owner).toMatchObject({ id: movedOn.id });
  });

  it("moves what she fetched with her when her owner is put right", async () => {
    const slip = await buy("2046-11-12T05:00:00.000Z", 70_000);
    const manager = await as("manager", "2046-11-12T06:00:00.000Z");
    const sold = await manager.client.sale.record({
      tagNumber: slip.tagNumber,
      buyer: { name: `ক্রেতা ${suffix}` },
      priceBdt: 100_000,
      weightKg: 250,
      destination: `হাট ${suffix}`,
      vehicle: "ট্রাক",
      driver: `চালক ${suffix}`,
      soldAt: new Date("2046-11-12T06:00:00.000Z"),
    });
    const buyer = await as("owner", "2046-11-12T06:30:00.000Z");
    await buyer.client.intake.correct({
      id: slip.intakeId,
      reason: "ভেঞ্চারের গরু ছিল, বিক্রির পরে ধরা পড়েছে",
      changes: { owner: { from: null, to: ventureId }, ...PAID_BY_THE_VENTURE },
    });
    const owner = await as("owner", "2046-11-12T07:00:00.000Z");
    const itsOwn = await owner.client.money.list({ ...PERIOD, ventureId });
    const ids = itsOwn.events.map((one) => one.sourceId);
    // What she cost and what she fetched are in one purse: the two in different purses would make
    // both sets of figures wrong.
    expect(ids).toContain(slip.intakeId);
    expect(ids).toContain(sold.id);
  });

  it("asks the Owner again when money changes purses", async () => {
    // A Venture's bull at the gate, the Owner's to take in and paid from its account by bank.
    const big = await buy("2046-11-13T05:00:00.000Z", 150_000, ventureId);
    // Said by the Manager to have been the Farm's all along: the Farm's hundred and fifty-one thousand is a
    // different question from the Investors', and the farm asks it of the Owner.
    const manager = await as("manager", "2046-11-13T07:00:00.000Z");
    await manager.client.intake.correct({
      id: big.intakeId,
      reason: "খামারের টাকায় কেনা",
      changes: {
        owner: { from: ventureId, to: null },
        targetWindow: {
          from: {
            start: WINDOW.targetWindowStart,
            end: WINDOW.targetWindowEnd,
          },
          to: { start: "2047-06-01", end: "2047-06-03" },
        },
      },
    });
    const after = await as("owner", "2046-11-13T08:00:00.000Z");
    const theFarms = await after.client.money.list(PERIOD);
    expect(
      theFarms.events.find((one) => one.sourceId === big.intakeId)
    ).toMatchObject({ approval: "awaiting" });
  });

  it("says nothing of whose she is to the people who work the shed", async () => {
    const theirs = await buy("2046-11-07T05:00:00.000Z", 60_000, ventureId);
    const staff = await as("staff", "2046-11-07T06:00:00.000Z");
    const her = await staff.client.animals.byTag({
      tagNumber: theirs.tagNumber,
    });
    // She is in the shed to be fed and watched, and whose money she is standing on is not their business.
    expect(her.owner).toBeNull();
  });

  it("leaves what she fetches where she belonged", async () => {
    const theirs = await buy("2046-11-08T05:00:00.000Z", 90_000, ventureId);
    const manager = await as("manager", "2046-11-09T05:00:00.000Z");
    const sold = await manager.client.sale.record({
      tagNumber: theirs.tagNumber,
      buyer: { name: `ক্রেতা ${suffix}` },
      priceBdt: 130_000,
      weightKg: 260,
      destination: `ঢাকার হাট ${suffix}`,
      vehicle: "ট্রাক ঢাকা-মেট্রো-ট ১১-২২৩৩",
      driver: `চালক ${suffix}`,
      soldAt: new Date("2046-11-09T05:00:00.000Z"),
    });
    const owner = await as("owner", "2046-11-09T06:00:00.000Z");
    const theFarms = await owner.client.money.list(PERIOD);
    expect(theFarms.events.map((one) => one.sourceId)).not.toContain(sold.id);
    const itsOwn = await owner.client.money.list({ ...PERIOD, ventureId });
    expect(itsOwn.events.find((one) => one.sourceId === sold.id)).toMatchObject(
      { amountBdt: 130_000, direction: "in" }
    );
  });
});

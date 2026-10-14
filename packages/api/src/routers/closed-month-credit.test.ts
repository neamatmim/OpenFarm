import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Milk and cattle sent wholly on credit book no money, yet what a buyer owed at a month's end and what the milk or the
// animal fetched are that month's figures: written, put right or voided into a Closed Month, they are the Owner's
// alone, and hers are listed under "changed after closing" (ADR 0028 addendum).

const suffix = `closed-credit-${Date.now()}`;
const SHOP = `দোকান ${suffix}`;
const CENTER = `কেন্দ্র ${suffix}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** After April 2091 is closed, early in May. */
const MAY = "2091-05-08T06:00:00.000Z";

const MONTH_CLOSED = { data: { refusal: "month_closed" } };

let penId = "";
let aprilDispatchId = "";

/** A bull of the Owner's, bought at the start of April and fit for sale. */
const aBull = async () => {
  const owner = await as("owner", "2091-04-01T06:00:00.000Z");
  return await owner.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2091-04-01T05:00:00.000Z"),
    targetWindowStart: "2091-08-17",
    targetWindowEnd: "2091-08-19",
  });
};

/** A sale of hers into April, wholly on credit. */
const soldOnCredit = (tagNumber: string) => ({
  tagNumber,
  soldAt: new Date("2091-04-25T05:00:00.000Z"),
  buyer: { name: SHOP },
  priceMoney: 110_000,
  paidNowMoney: 0,
  promisedBy: "2091-05-20",
  weightKg: 320,
  destination: `গাবতলী ${suffix}`,
  vehicle: "ট্রাক",
  driver: `চালক ${suffix}`,
});

/** Milk sent on April 20, all of it on credit. */
const milkOnCredit = {
  dispatchedAt: new Date("2091-04-20T01:00:00.000Z"),
  liters: 100,
  buyer: { name: CENTER },
  pricePerLiterMoney: 60,
  paidNowMoney: 0,
};

beforeAll(async () => {
  const owner = await as("owner", "2091-04-01T06:00:00.000Z");
  await owner.client.farm.setIdentity({
    address: `সাভার ${suffix}`,
    phone: "+8801711000097",
    registrationNumber: `DLS/SAV/2091/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2093-03-31",
  });
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  penId = pen.id;
  // Milk sent on credit in April, while April stood open.
  const manager = await as("manager", "2091-04-10T06:00:00.000Z");
  const sent = await manager.client.milk.dispatch({
    ...milkOnCredit,
    dispatchedAt: new Date("2091-04-10T01:00:00.000Z"),
  });
  aprilDispatchId = sent.id;
  const closing = await as("owner", MAY);
  await closing.client.monthlyReport.close({ month: "2091-04" });
});

/** What the Owner's changes to April are listed as, in May. */
const changedInMay = async () => {
  const owner = await as("owner", MAY);
  const may = await owner.client.monthlyReport.month({ month: "2091-05" });
  return may.changedAfterClosing;
};

describe("milk sent on credit into a closed month", () => {
  it("is refused to the Manager, and the Owner's is listed", async () => {
    const manager = await as("manager", MAY);

    await expect(
      manager.client.milk.dispatch(milkOnCredit)
    ).rejects.toMatchObject(MONTH_CLOSED);

    const owner = await as("owner", MAY);
    const { id } = await owner.client.milk.dispatch(milkOnCredit);

    expect(await changedInMay()).toContainEqual(
      expect.objectContaining({
        month: "2091-04",
        recordId: id,
        source: "dispatch",
        about: CENTER,
        change: "entered",
        beforeMoney: null,
        afterMoney: 6000,
      })
    );
  });

  it("put right is the Owner's alone too where it moves what he owed", async () => {
    const manager = await as("manager", MAY);

    await expect(
      manager.client.milk.correctDispatch({
        id: aprilDispatchId,
        reason: "লিটার ভুল",
        changes: { liters: { from: 100, to: 90 } },
      })
    ).rejects.toMatchObject(MONTH_CLOSED);
  });
});

describe("a promise moved on credit of a closed month", () => {
  it("changes nothing he owed, so it is neither refused nor listed", async () => {
    const bull = await aBull();
    const owner = await as("owner", MAY);
    const sold = await owner.client.sales.record(soldOnCredit(bull.tagNumber));

    await owner.client.sales.correct({
      id: sold.id,
      reason: "পরে দেবে বলেছে",
      changes: { promisedBy: { from: "2091-05-20", to: "2091-05-30" } },
    });

    const changes = await changedInMay();
    const listed = changes.filter((one) => one.recordId === sold.id);

    expect(listed.map((one) => one.change)).toEqual(["entered"]);
  });
});

describe("cattle sold on credit into a closed month", () => {
  it("is refused to the Manager, and the Owner's is listed by the buyer and her tag", async () => {
    const bull = await aBull();
    const manager = await as("manager", MAY);

    await expect(
      manager.client.sales.record(soldOnCredit(bull.tagNumber))
    ).rejects.toMatchObject(MONTH_CLOSED);

    const owner = await as("owner", MAY);
    const sold = await owner.client.sales.record(soldOnCredit(bull.tagNumber));

    expect(await changedInMay()).toContainEqual(
      expect.objectContaining({
        month: "2091-04",
        recordId: sold.id,
        source: "sale",
        about: SHOP,
        tagNumber: bull.tagNumber,
        change: "entered",
        afterMoney: 110_000,
      })
    );
  });

  it("voided by the Owner is listed as voided", async () => {
    const bull = await aBull();
    const owner = await as("owner", MAY);
    const sold = await owner.client.sales.record(soldOnCredit(bull.tagNumber));

    await owner.client.sales.correct({
      id: sold.id,
      reason: "ভুল পশু",
      changes: { voided: { from: false, to: true } },
    });

    expect(await changedInMay()).toContainEqual(
      expect.objectContaining({
        month: "2091-04",
        recordId: sold.id,
        source: "sale",
        change: "voided",
        beforeMoney: 110_000,
        afterMoney: null,
      })
    );
  });
});

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

// What leaving the farm says, put right: a lorry carries only animals that could have been on it, a Sale's day can be
// corrected, and a Sale or a death written against the wrong animal the Owner can void — she comes back as she was.

const suffix = `herd-money-${Date.now()}`;
let penId = "";

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2070-01-01T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `পেন ${suffix}`,
    quarantine: true,
  });
  penId = pen.id;
});

const aBull = async (instant: string) => {
  const manager = await as("manager", instant);
  return await manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceMoney: 50_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
  });
};

const sell = async (instant: string, tagNumber: string) => {
  const manager = await as("manager", instant);
  return await manager.client.sales.record({
    tagNumber,
    buyer: { name: `করিম ব্যাপারী ${suffix}` },
    weightKg: 300,
    destination: `গাবতলী ${suffix}`,
    vehicle: "ঢাকা মেট্রো-ট ১১-৪৪৫৬",
    driver: `চালক ${suffix}`,
    priceMoney: 90_000,
    paymentMethod: "cash",
  });
};

const her = async (tagNumber: string) =>
  await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber },
    columns: { id: true, state: true, stateChangedAt: true },
  });

describe("a Selling Trip", () => {
  it("is refused an animal who could not have been on the lorry", async () => {
    const bull = await aBull("2070-02-01T04:00:00.000Z");
    const manager = await as("manager", "2070-02-02T04:00:00.000Z");
    await manager.client.animals.recordMortality({
      photo: A_DEATH_PHOTO,
      tagNumber: bull.tagNumber,
      kind: "died",
      cause: `বুক ফুলে মারা গেছে ${suffix}`,
      disposal: "buried",
    });
    const later = await as("manager", "2070-03-02T04:00:00.000Z");
    await expect(
      later.client.sellingTrips.record({
        wentTo: `গাবতলী ${suffix}`,
        transportMoney: 5000,
        paymentMethod: "cash",
        animals: [bull.tagNumber],
      })
    ).rejects.toMatchObject({ data: { refusal: "not_on_that_lorry" } });
  });
});

describe("a Sale put right", () => {
  it("takes the day she really left", async () => {
    const bull = await aBull("2070-04-01T04:00:00.000Z");
    const sold = await sell("2070-04-10T04:00:00.000Z", bull.tagNumber);
    const manager = await as("manager", "2070-04-11T04:00:00.000Z");
    const wentOn = new Date("2070-04-09T04:00:00.000Z");
    await manager.client.sales.correct({
      id: sold.id,
      reason: "আগের দিন বিক্রি হয়েছিল",
      changes: {
        soldAt: { from: "2070-04-10T04:00:00.000Z", to: wentOn },
      },
    });
    const after = await her(bull.tagNumber);
    expect(after?.stateChangedAt).toEqual(wentOn);
  });

  it("keeps in the trail whose hand the cash was in before a Correction moved it", async () => {
    const bull = await aBull("2070-04-15T04:00:00.000Z");
    // The Manager sold her for cash, into the Manager's own hand.
    const sold = await sell("2070-04-20T04:00:00.000Z", bull.tagNumber);
    const owner = await as("owner", "2070-04-20T06:00:00.000Z");
    await owner.client.sales.correct({
      id: sold.id,
      reason: "টাকা মালিকের হাতে দেওয়া হয়েছিল",
      changes: {
        heldBy: {
          from: thePerson("manager").id,
          to: thePerson("owner").id,
        },
      },
    });
    const trail = await owner.client.audit.list({
      entity: "sale",
      limit: 50,
    });
    const corrected = trail.find(
      (one) => one.entityId === sold.id && one.reason !== null
    );
    expect(corrected?.before).toMatchObject({
      money: { heldBy: thePerson("manager").id },
    });
    expect(corrected?.after).toMatchObject({
      money: { heldBy: thePerson("owner").id },
    });
  });

  it("is voided by the Owner, and she is back as she was", async () => {
    const bull = await aBull("2070-05-01T04:00:00.000Z");
    const before = await her(bull.tagNumber);
    const sold = await sell("2070-05-10T04:00:00.000Z", bull.tagNumber);
    const manager = await as("manager", "2070-05-10T06:00:00.000Z");
    await expect(
      manager.client.sales.correct({
        id: sold.id,
        reason: "ভুল ট্যাগ",
        changes: { voided: { from: false, to: true } },
      })
    ).rejects.toThrow();
    const owner = await as("owner", "2070-05-10T06:00:00.000Z");
    await owner.client.sales.correct({
      id: sold.id,
      reason: "ভুল ট্যাগে বিক্রি লেখা হয়েছিল",
      changes: { voided: { from: false, to: true } },
    });
    expect(await her(bull.tagNumber)).toMatchObject({
      state: before?.state,
      stateChangedAt: before?.stateChangedAt,
    });
    const paid = await scratchDb().query.moneyEvent.findFirst({
      where: { source: "sale", sourceId: sold.id },
      columns: { amountMoney: true },
    });
    expect(paid?.amountMoney ?? 0).toBe(0);
  });
});

describe("a death written against the wrong animal", () => {
  it("is voided by the Owner, and she is back as she was", async () => {
    const bull = await aBull("2070-06-01T04:00:00.000Z");
    const before = await her(bull.tagNumber);
    const manager = await as("manager", "2070-06-05T04:00:00.000Z");
    await manager.client.animals.recordMortality({
      photo: A_DEATH_PHOTO,
      tagNumber: bull.tagNumber,
      kind: "died",
      cause: `ভুল ট্যাগ ${suffix}`,
      disposal: "buried",
    });
    const owner = await as("owner", "2070-06-05T06:00:00.000Z");
    await owner.client.animals.correctMortality({
      tagNumber: bull.tagNumber,
      reason: "অন্য ষাঁড় মারা গেছে, ট্যাগ ভুল",
      changes: { voided: { from: false, to: true } },
    });
    expect(await her(bull.tagNumber)).toMatchObject({
      state: before?.state,
      stateChangedAt: before?.stateChangedAt,
    });
    // Her own trail says who brought her back, and the death's names her.
    const trail = await owner.client.audit.list({ limit: 200 });
    const hers = trail.filter((one) => one.tagNumber === bull.tagNumber);
    expect(hers.map((one) => one.entity)).toEqual(
      expect.arrayContaining(["animal", "mortality"])
    );
    expect(
      hers.find(
        (one) =>
          one.entity === "animal" &&
          (one.after as { backFrom?: string } | null)?.backFrom === "death"
      )
    ).toMatchObject({ roleUsed: "owner" });
    // And the photograph of the bull that really died is kept, under the one it was written against.
    const kept = await scratchDb().query.voidedPhoto.findMany({
      where: { animalId: before?.id ?? "" },
      columns: { from: true, contentType: true },
    });
    expect(kept).toEqual([{ from: "death", contentType: "image/jpeg" }]);
    // On her page, for those who run the farm, with who voided it; never Barn Staff's.
    const shown = await owner.client.animals.voidedPhotos({
      tagNumber: bull.tagNumber,
    });
    expect(shown).toMatchObject([
      { from: "death", voidedByName: thePerson("owner").name },
    ]);
    const staff = await as("staff", "2070-06-05T07:00:00.000Z");
    await expect(
      staff.client.animals.voidedPhotos({ tagNumber: bull.tagNumber })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Animals aimed at an Eid still on the Farm once its Qurbani is over: the Owner and the Manager are told in the evening's
// post, once for that Eid. The table expects Eid-ul-Adha on 17 May 2027, with Qurbani to the 19th.

const suffix = `after-eid-${Date.now()}`;
const EID = { targetWindowStart: "2027-05-17", targetWindowEnd: "2027-05-19" };

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let penId = "";
let soldTag = "";

const aBull = async () => {
  const manager = await as("manager", "2027-03-02T04:00:00.000Z");
  const bull = await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 90_000,
    weightKg: 260,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2027-03-02T04:00:00.000Z"),
    ...EID,
  });
  return bull.tagNumber;
};

beforeAll(async () => {
  const owner = await as("owner", "2027-03-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  await aBull();
  soldTag = await aBull();
  await aBull();
  // One of the three went at the haat on the first day of Qurbani.
  const manager = await as("manager", "2027-05-17T06:00:00.000Z");
  await manager.client.sale.record({
    tagNumber: soldTag,
    buyer: { name: `ক্রেতা ${suffix}` },
    priceMoney: 150_000,
    weightKg: 330,
    destination: `গাবতলী ${suffix}`,
    vehicle: "ঢাকা মেট্রো-ট ১১-৪৪৫৭",
    driver: `চালক ${suffix}`,
  });
});

const sweepOn = async (instant: string) => {
  const manager = await as("manager", instant);
  await manager.client.alerts.sweep();
};

const told = async () =>
  await scratchDb().query.alert.findMany({
    where: {
      farmId: theFarm().id,
      kind: "still_here_after_eid",
      entityId: "2027-05-17",
    },
    columns: { userId: true, entityId: true, params: true },
    orderBy: { userId: "asc" },
  });

describe("animals still here after their Eid", () => {
  it("are told of nobody while Qurbani lasts", async () => {
    await sweepOn("2027-05-19T12:00:00.000Z");
    expect(await told()).toEqual([]);
  });

  it("are told to the Owner and the Manager the day after, the sold ones not counted", async () => {
    await sweepOn("2027-05-20T12:00:00.000Z");
    const ours = await told();
    expect(ours.map((one) => one.userId).toSorted()).toEqual(
      [thePerson("owner").id, thePerson("manager").id].toSorted()
    );
    expect(ours[0]?.params).toMatchObject({
      day: "2027-05-17",
      animals: 2,
      inVentures: 0,
    });
  });

  it("are told once for that Eid, however often the day turns", async () => {
    await sweepOn("2027-05-22T12:00:00.000Z");
    expect(await told()).toHaveLength(2);
  });
});

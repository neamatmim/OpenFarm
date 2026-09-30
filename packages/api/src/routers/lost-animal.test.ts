import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// An animal that leaves the farm some other way than dying is no carcass to bury: a Sale, and — once written off — an
// animal lost.

const suffix = `lost-${Date.now()}`;

let penId = "";
let burialId = "";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2066-03-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const burial = await owner.client.sops.create({
    content: standardPlaybook().burial,
  });
  burialId = burial.definitionId;
});

/** One bull off the lorry. */
const aBull = async (instant: string) => {
  const manager = await as("manager", instant);
  return manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
  });
};

const burialsFor = async (tag: string, instant: string) => {
  const manager = await as("manager", instant);
  await manager.client.instances.ensureDue();
  const him = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber: tag },
    columns: { id: true },
  });
  return scratchDb().query.sopInstance.findMany({
    where: { animalId: him?.id ?? "", definitionId: burialId },
    columns: { id: true },
  });
};

describe("an animal that leaves without dying", () => {
  it("raises no carcass disposal when he is sold", async () => {
    const bull = await aBull("2066-03-02T04:00:00.000Z");
    const manager = await as("manager", "2066-03-10T06:00:00.000Z");
    await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      buyer: { name: `করিম ব্যাপারী ${suffix}`, phone: "+8801711000078" },
      weightKg: 330,
      destination: `গাবতলী ${suffix}`,
      vehicle: "ঢাকা মেট্রো-ট ১১-৪৪৫৬",
      driver: `চালক ${suffix}`,
      priceBdt: 120_000,
    });
    expect(
      await burialsFor(bull.tagNumber, "2066-03-10T07:00:00.000Z")
    ).toEqual([]);
  });
});

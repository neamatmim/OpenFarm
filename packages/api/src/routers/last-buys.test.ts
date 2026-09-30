import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// What the farm's own recent buys near a weight cost a kilo, beside the price the Manager is typing at the haat.

const suffix = `last-buys-${Date.now()}`;
const NOW = "2082-03-20T06:00:00.000Z";
const WINDOW = {
  targetWindowStart: "2082-06-01",
  targetWindowEnd: "2082-06-03",
};

const as = (role: "owner" | "manager" | "staff", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2082-01-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  for (const [priceBdt, weightKg, day] of [
    [100_000, 250, "2082-03-10"],
    [120_000, 270, "2082-02-10"],
    // Too light to set beside a 260 kg bull, and one bought too long ago.
    [60_000, 150, "2082-03-15"],
    [50_000, 260, "2081-12-01"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one bull off the lorry after the other
    const manager = await as("manager", `${day}T04:00:00.000Z`);
    // oxlint-disable-next-line no-await-in-loop -- as above
    await manager.client.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: priceBdt,
      weightKg,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(`${day}T04:00:00.000Z`),
      ...WINDOW,
    });
  }
});

describe("what the last buys cost a kilo", () => {
  it("is the last two months' buys near her weight, weighed by weight", async () => {
    const manager = await as("manager");
    expect(await manager.client.intake.lastBuys({ weightKg: 260 })).toEqual({
      bdtPerKg: 423.08,
      animals: 2,
      days: 60,
    });
  });

  it("is nothing where the farm bought none near her weight", async () => {
    const manager = await as("manager");
    expect(await manager.client.intake.lastBuys({ weightKg: 600 })).toBeNull();
  });

  it("is the Owner's and the Manager's, who buy", async () => {
    const staff = await as("staff");
    await expect(
      staff.client.intake.lastBuys({ weightKg: 260 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Intake: a bought-in animal arrives on the Fattening side.
 *
 * A quarantine Pen of this file's own, so a count over its arrivals is a count of what these
 * tests put there and nothing else.
 */
const QUARANTINE = `intake-${Date.now()}`;
let penId = "";

beforeAll(async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({ name: QUARANTINE });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "কোয়ারেন্টিন",
  });
  penId = pen.id;
});

describe("intake", () => {
  it("takes an animal in and feeds it towards the next Eid", async () => {
    // Well before Eid-ul-Adha 2027, so the window the farm defaults to is that one.
    const clock = new FakeClock("2027-01-15T04:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    const taken = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: "রহমান ব্যাপারী", address: "সাভার হাট, ঢাকা" },
      purchasePriceBdt: 95_000,
      weightKg: 210.5,
      estimatedAgeMonths: 24,
      breed: "শাহীওয়াল",
    });

    // Its own F- number, in quarantine, on the fattening side, bought rather than born.
    expect(taken.tagNumber).toMatch(/^F-\d{4,}$/u);
    expect(taken.state).toBe("quarantine");

    const her = await manager.client.animals.byTag({
      tagNumber: taken.tagNumber,
    });
    expect(her.side).toBe("fattening");
    expect(her.source).toBe("bought");
    expect(her.penId).toBe(penId);
    expect(her.breed).toBe("শাহীওয়াল");

    // Her page reads as an intake: what she cost, what she weighed, and what she is being
    // fed towards — the next Eid-ul-Adha, which nobody had to type.
    expect(her.intake).toMatchObject({
      purchasePriceBdt: 95_000,
      weightKg: 210.5,
      estimatedAgeMonths: 24,
      sellerName: "রহমান ব্যাপারী",
      sellerAddress: "সাভার হাট, ঢাকা",
    });
    expect(her.intake?.targetWindow).toEqual({
      start: "2027-05-17",
      end: "2027-05-19",
    });
    // The farm's own target weight, which the Manager may tune like any other parameter.
    expect(her.intake?.targetWeightKg).toBe(350);
  });

  it("lets the Manager move the window, and lets nobody else take an animal in", async () => {
    const clock = new FakeClock("2027-01-16T04:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });

    const arriving = {
      penId,
      sex: "male" as const,
      seller: { name: "রহমান ব্যাপারী" },
      purchasePriceBdt: 88_000,
      weightKg: 190,
      estimatedAgeMonths: 20,
    };

    // Buying an animal is not a milker's act, nor a Vet's — and the roles matrix gives Intake
    // to the Manager alone, the Owner approving what it cost rather than doing the buying. An
    // Owner sent here is told why, not left looking for a permission to change.
    await expect(staff.client.intake.record(arriving)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(vet.client.intake.record(arriving)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    await expect(owner.client.intake.record(arriving)).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { refusal: "manager_only" },
    });

    // This one is for the Qurbani market in Chattogram, which the Manager sells into early.
    const taken = await manager.client.intake.record({
      ...arriving,
      targetWindowStart: "2027-05-10",
      targetWindowEnd: "2027-05-16",
      targetWeightKg: 300,
    });
    const her = await manager.client.animals.byTag({
      tagNumber: taken.tagNumber,
    });
    expect(her.intake?.targetWindow).toEqual({
      start: "2027-05-10",
      end: "2027-05-16",
    });
    expect(her.intake?.targetWeightKg).toBe(300);

    // And the arrival is on the trail, as every act that makes an animal is.
    const trail = await manager.client.audit.list({
      entity: "animal",
      entityId: her.id,
    });
    expect(trail.some((event) => event.action === "create")).toBe(true);
  });

  it("keeps one trader for one name, and learns what it did not know", async () => {
    const clock = new FakeClock("2027-01-17T04:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const trader = `করিম ব্যাপারী ${Date.now()}`;
    const arriving = {
      penId,
      sex: "male" as const,
      purchasePriceBdt: 70_000,
      weightKg: 175,
      estimatedAgeMonths: 18,
    };

    // He gave his hat the first time and his number the second. The farm ends with one man.
    await manager.client.intake.record({
      ...arriving,
      seller: { name: trader, address: "গাবতলী হাট, ঢাকা" },
    });
    await manager.client.intake.record({
      ...arriving,
      seller: { name: trader, address: "অন্য কোথাও", phone: "+8801711000077" },
    });

    const sellers = await manager.client.intake.sellers();
    const named = sellers.filter((one) => one.name === trader);
    expect(named).toHaveLength(1);
    expect(named[0]).toMatchObject({
      // What the farm already knew is not overwritten by what somebody said today.
      address: "গাবতলী হাট, ঢাকা",
      phone: "+8801711000077",
    });
  });

  it("feeds an animal towards the weight the farm has set", async () => {
    const clock = new FakeClock("2027-01-18T04:00:00.000Z");
    const setter = await createTestClient(appRouter, { as: "manager", clock });
    await setter.client.farm.setParameters({ fatteningTargetWeightKg: 420 });
    try {
      const manager = await createTestClient(appRouter, {
        as: "manager",
        clock,
      });
      const taken = await manager.client.intake.record({
        penId,
        sex: "male",
        seller: { name: `বাজার ${Date.now()}` },
        purchasePriceBdt: 70_000,
        weightKg: 175,
        estimatedAgeMonths: 18,
      });
      const her = await manager.client.animals.byTag({
        tagNumber: taken.tagNumber,
      });
      expect(her.intake?.targetWeightKg).toBe(420);
    } finally {
      // The parameter is the Farm's and the tests around this one read it; put it back.
      await setter.client.farm.setParameters({ fatteningTargetWeightKg: 350 });
    }
  });
});

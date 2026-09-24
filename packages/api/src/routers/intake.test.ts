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

    const breeds = await manager.client.breeds.list();
    const sahiwal = breeds.find((one) => one.key === "sahiwal")?.id;
    const taken = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: "রহমান ব্যাপারী", address: "সাভার হাট, ঢাকা" },
      purchasePriceBdt: 95_000,
      weightKg: 210.5,
      estimatedAgeMonths: 24,
      breedId: sahiwal,
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
    expect(her.breed?.nameBn).toBe("শাহীওয়াল");

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

  it("lets the Manager move the window, and nobody but the Manager and the Owner take an animal in", async () => {
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

    // Buying an animal is not a milker's act, nor a Vet's.
    await expect(staff.client.intake.record(arriving)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(vet.client.intake.record(arriving)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // The Owner may do it as the Manager does, and what the Owner paid waits for nobody's approval.
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const ownersBuy = await owner.client.intake.record(arriving);
    const money = await owner.client.money.list({
      from: "2027-01-01",
      to: "2027-01-31",
    });
    expect(
      money.events.filter((one) => one.sourceId === ownersBuy.intakeId)
    ).toEqual([
      expect.objectContaining({ amountBdt: 88_000, approval: "not_needed" }),
    ]);

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

  // The haat takes a toll on every beast bought there, often on her price. It is part of what she cost
  // the farm, not a second payment to a second party — so it rides on her Intake and on its Money Event.
  it("records the Hasil the haat took, as part of what her arrival cost", async () => {
    const clock = new FakeClock("2027-02-02T04:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    const taken = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `হাসিল বেপারী ${QUARANTINE}` },
      purchasePriceBdt: 80_000,
      hasilBdt: 2000,
      weightKg: 200,
      estimatedAgeMonths: 20,
    });

    const her = await manager.client.animals.byTag({
      tagNumber: taken.tagNumber,
    });
    expect(her.intake).toMatchObject({
      purchasePriceBdt: 80_000,
      hasilBdt: 2000,
    });

    // One Money Event for her arrival, for what the farm actually handed over.
    const money = await manager.client.money.list({
      from: "2027-02-01",
      to: "2027-02-28",
    });
    const hers = money.events.find((one) => one.sourceId === taken.intakeId);
    expect(hers).toMatchObject({ amountBdt: 82_000 });

    // An animal bought with no toll paid carries none.
    const free = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `হাসিল বেপারী ${QUARANTINE}` },
      purchasePriceBdt: 60_000,
      weightKg: 190,
      estimatedAgeMonths: 18,
    });
    const his = await manager.client.animals.byTag({
      tagNumber: free.tagNumber,
    });
    expect(his.intake).toMatchObject({ hasilBdt: 0 });

    // The slip said 2,400 and the Manager typed 2,000: a Correction like any other.
    await manager.client.intake.correct({
      id: taken.intakeId,
      reason: "হাটের রসিদ অনুযায়ী ঠিক করা হলো",
      changes: { hasilBdt: { from: 2000, to: 2400 } },
    });
    const afterwards = await manager.client.animals.byTag({
      tagNumber: taken.tagNumber,
    });
    expect(afterwards.intake).toMatchObject({ hasilBdt: 2400 });
    // The same Money Event put right, never a second one.
    const afterMoney = await manager.client.money.list({
      from: "2027-02-01",
      to: "2027-02-28",
    });
    expect(
      afterMoney.events.filter((one) => one.sourceId === taken.intakeId)
    ).toEqual([expect.objectContaining({ amountBdt: 82_400 })]);

    // And it is in the trail, under the animal it belongs to, with what it said before.
    const trail = await manager.client.audit.list({
      entity: "animal",
      entityId: taken.id,
    });
    expect(trail[0]).toMatchObject({
      action: "correct",
      reason: "হাটের রসিদ অনুযায়ী ঠিক করা হলো",
      roleUsed: "manager",
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

  it("tells anybody who may see her how old the seller said she was, without what she cost", async () => {
    // A bought bull has no birth date, so this is all the farm has to give his age by.
    const clock = new FakeClock("2027-01-19T04:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    const taken = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `বাজার ${Date.now()}` },
      purchasePriceBdt: 72_000,
      weightKg: 180,
      estimatedAgeMonths: 19,
    });
    const told = {
      estimatedAgeMonths: 19,
      arrivedAt: new Date("2027-01-19T04:00:00.000Z"),
    };

    const his = await vet.client.animals.byTag({ tagNumber: taken.tagNumber });
    expect(his.birthDate).toBeNull();
    expect(his.intake).toBeNull();
    expect(his.ageAtIntake).toEqual(told);

    const herd = await vet.client.animals.list({ includeExited: false });
    expect(
      herd.find((one) => one.tagNumber === taken.tagNumber)?.ageAtIntake
    ).toEqual(told);
  });
});

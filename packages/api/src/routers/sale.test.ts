import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm, thePerson } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Sale: the one gate that stops a farm selling meat it cannot say is safe.

const suffix = `${Date.now()}`;

/** A worming campaign, so the treated bull is genuinely inside a withdrawal. */
const campaignSop = (productId: string): SopContent => ({
  name: { bn: `কৃমিনাশক ${suffix}`, en: "Worming" },
  purpose: { bn: "পেনের সব পশুকে কৃমিনাশক" },
  triggers: [],
  appliesTo: { side: "fattening" },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 240,
  steps: [
    {
      id: "dose",
      text: { bn: "কৃমিনাশক খাওয়ান" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "অসুস্থ" }],
      effect: { kind: "treatment", productId },
    },
  ],
});

const setup = async () => {
  const clock = new FakeClock("2027-04-01T07:30:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  const vet = await createTestClient(appRouter, { as: "vet", clock });
  const shed = await owner.client.herd.createShed({ name: `sale-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `বিক্রয় ${suffix}`,
  });
  const treatedPen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `চিকিৎসা ${suffix}`,
  });

  /** Ready to sell: taken in, walked up to Fattening, and confirmed. */
  const ready = async (penId: string) => {
    const taken = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `হাট ${suffix}` },
      purchasePriceBdt: 90_000,
      weightKg: 300,
      estimatedAgeMonths: 24,
      targetWeightKg: 280,
      targetWindowStart: "2027-05-17",
      targetWindowEnd: "2027-05-19",
    });
    await manager.client.animals.setState({
      tagNumber: taken.tagNumber,
      state: "fattening",
    });
    return taken;
  };
  const bulls = [
    await ready(pen.id),
    await ready(pen.id),
    await ready(treatedPen.id),
  ];
  for (const bull of bulls.slice(0, 2)) {
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.ready.confirm({ tagNumber: bull.tagNumber });
  }

  const wormer = await vet.client.drugs.add({
    name: { bn: `আলবেন্ডাজল ${suffix}`, en: "Albendazole" },
    milkWithdrawalDays: 3,
    meatWithdrawalDays: 14,
  });
  const campaign = await owner.client.sops.create({
    content: campaignSop(wormer.id),
  });

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-sale-${treatedPen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: treatedPen.id,
    })
    .onConflictDoNothing();

  return { owner, manager, pen, treatedPen, bulls, campaign };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const { and: allOf, eq, inArray } = await import("@OpenFarm/db/operators");
  const { penAssignment: assignment } =
    await import("@OpenFarm/db/schema/herd");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { sopInstance } = await import("@OpenFarm/db/schema/instance");
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.campaign.definitionId));
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      allOf(
        eq(sopInstance.definitionId, world.campaign.definitionId),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
  // The Pen Assignment this file made goes with it: a later test counting what the milker can see counts the Pens
  // they actually work, not the one a finished test lent them.
  await db
    .delete(assignment)
    .where(eq(assignment.id, `pa-sale-${world.treatedPen.id}`));
});

const tagOf = (index: number) => world.bulls[index]?.tagNumber ?? "";
const asManager = (day: string) =>
  createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock(`${day}T09:00:00.000Z`),
  });

/** The worming campaign, raised by hand over the treated Pen. */
const worm = async (day: string) => {
  const clock = new FakeClock(`${day}T08:00:00.000Z`);
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  await manager.client.instances.raiseNow({
    definitionId: world.campaign.definitionId,
    penId: world.treatedPen.id,
  });
  const today = await manager.client.instances.today({
    penId: world.treatedPen.id,
  });
  const raised = today.find(
    (candidate) => candidate.definitionId === world.campaign.definitionId
  );
  if (!raised) {
    throw new Error("expected a worming instance");
  }
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  await staff.client.instances.claim({ id: raised.id });
  await staff.client.instances.completeStep({
    instanceId: raised.id,
    stepId: "dose",
    animalTag: tagOf(2),
    evidence: [true],
  });
};

const aBuyer = {
  buyer: {
    name: `কাদের কসাই ${suffix}`,
    address: "গাবতলী, ঢাকা",
    phone: "+8801711000055",
  },
  destination: "গাবতলী পশুর হাট",
  vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৩",
  driver: "সোহেল",
};

describe("the sale", () => {
  it("sells her, exits her, and leaves her history alone", async () => {
    const manager = await asManager("2027-04-02");
    const sold = await manager.client.sale.record({
      tagNumber: tagOf(0),
      ...aBuyer,
      priceBdt: 145_000,
      weightKg: 312.5,
    });
    expect(sold.state).toBe("sold");

    const her = await manager.client.animals.byTag({ tagNumber: tagOf(0) });
    expect(her.state).toBe("sold");
    // Her arrival is still on her page: an animal who has left keeps everything she was.
    expect(her.intake?.purchasePriceBdt).toBe(90_000);
    expect(her.sale).toMatchObject({
      priceBdt: 145_000,
      weightKg: 312.5,
      buyerName: aBuyer.buyer.name,
      destination: aBuyer.destination,
      vehicle: aBuyer.vehicle,
      driver: aBuyer.driver,
    });

    // And she is out of the herd everywhere at once.
    const herd = await manager.client.animals.list({ includeExited: false });
    expect(herd.some((row) => row.tagNumber === tagOf(0))).toBe(false);
  });

  it("offers the same buyer and lorry again on the same morning", async () => {
    const manager = await asManager("2027-04-02");
    const again = await manager.client.sale.lastToday();
    expect(again).toMatchObject({
      buyerName: aBuyer.buyer.name,
      destination: aBuyer.destination,
      vehicle: aBuyer.vehicle,
      driver: aBuyer.driver,
    });

    // A different morning is a different market: nothing is offered.
    const tomorrow = await asManager("2027-04-03");
    expect(await tomorrow.client.sale.lastToday()).toBeNull();
  });

  it("refuses outright while she is inside her withdrawal", async () => {
    await worm("2027-04-02");
    const manager = await asManager("2027-04-03");

    // Not ready, and not sellable either: the gate holds at both doors.
    await expect(
      manager.client.ready.confirm({ tagNumber: tagOf(2) })
    ).rejects.toMatchObject({ data: { refusal: "meat_withdrawal" } });
    await expect(
      manager.client.sale.record({
        tagNumber: tagOf(2),
        ...aBuyer,
        priceBdt: 120_000,
        weightKg: 290,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "meat_withdrawal" },
    });

    // And the refusal names the day she is fit, so somebody can plan around it.
    const refused = await manager.client.sale
      .record({
        tagNumber: tagOf(2),
        ...aBuyer,
        priceBdt: 120_000,
        weightKg: 290,
      })
      .catch((error: { data?: { fitOn?: string } }) => error);
    expect((refused as { data: { fitOn: string } }).data.fitOn).toContain(
      "2027-04-16"
    );
  });

  it("will not let the other door out of the herd", async () => {
    const manager = await asManager("2027-04-03");
    // Every exit has a record of its own to be written, so none of them is a State to set —
    // and setting Sold by hand would have walked a treated animal off the farm.
    await expect(
      manager.client.animals.setState({
        tagNumber: tagOf(2),
        state: "sold",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "exit_needs_a_record" },
    });
  });

  it("asks the gate about the day she went, not the day it was typed", async () => {
    // Wormed on 2 April, fit on the 16th. Written up on the 20th, but sold on the 10th —
    // back-dating is exactly how the gate would otherwise be got around.
    const manager = await asManager("2027-04-20");
    await expect(
      manager.client.sale.record({
        tagNumber: tagOf(2),
        ...aBuyer,
        priceBdt: 120_000,
        weightKg: 290,
        soldAt: new Date("2027-04-10T09:00:00.000Z"),
      })
    ).rejects.toMatchObject({ data: { refusal: "meat_withdrawal" } });

    // The same beast, sold after her days were up, goes through.
    const sold = await manager.client.sale.record({
      tagNumber: tagOf(2),
      ...aBuyer,
      priceBdt: 120_000,
      weightKg: 290,
      soldAt: new Date("2027-04-18T09:00:00.000Z"),
    });
    expect(sold.state).toBe("sold");
  });

  it("is not a milker's to make, nor the Owner's, and not twice over", async () => {
    const staff = await createTestClient(appRouter, {
      as: "staff",
      clock: new FakeClock("2027-04-03T09:00:00.000Z"),
    });
    await expect(
      staff.client.sale.record({
        tagNumber: tagOf(1),
        ...aBuyer,
        priceBdt: 130_000,
        weightKg: 300,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Nor the Owner's: the roles matrix gives Intake and Sale to the Manager, the Owner
    // approving what it fetched rather than doing the selling.
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2027-04-03T09:00:00.000Z"),
    });
    await expect(
      owner.client.sale.record({
        tagNumber: tagOf(1),
        ...aBuyer,
        priceBdt: 130_000,
        weightKg: 300,
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { refusal: "manager_only" },
    });

    // An animal who has left cannot leave again — the second sale would lose which one the
    // farm stands behind.
    const manager = await asManager("2027-04-03");
    await expect(
      manager.client.sale.record({
        tagNumber: tagOf(0),
        ...aBuyer,
        priceBdt: 130_000,
        weightKg: 300,
      })
    ).rejects.toThrow();
  });

  it("takes a cull that ends in a sale as a Sale, with the reason in its note", async () => {
    // The Owner's decision, 2026-09-12: going to a buyer is a Sale, destroyed here is a Cull.
    // One exit and one record, and why she was culled goes in the Sale's own note.
    const manager = await asManager("2027-04-04");
    const sold = await manager.client.sale.record({
      tagNumber: tagOf(1),
      ...aBuyer,
      priceBdt: 60_000,
      weightKg: 240,
      note: "বারবার ওলান প্রদাহ — কসাইয়ের কাছে",
    });
    expect(sold.state).toBe("sold");

    const her = await manager.client.animals.byTag({ tagNumber: tagOf(1) });
    expect(her.sale?.note).toContain("ওলান");
    // There is no second way out: a cull that went to a buyer is this record and no other.
    await expect(
      manager.client.animals.recordMortality({
        tagNumber: tagOf(1),
        kind: "culled",
        cause: "ওলান প্রদাহ",
        disposal: "buried",
      })
    ).rejects.toThrow();
  });
});

import { and } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Ready for Sale: the farm suggests, and the Manager decides. Every figure the suggestion rests
// on is worked out from the Intake and the Weigh-ins; the judgement is not.

const suffix = `${Date.now()}`;

/** A worming campaign, so one bull here is genuinely under a meat Withdrawal rather than
 *  having one written on him by hand. */
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

/** The weigh-in round this file walks, so the animals here have readings of their own. */
const weighInSop = (): SopContent => ({
  name: { bn: `ওজন ${suffix}`, en: "Weigh-in" },
  purpose: { bn: "প্রতিটি পশুর ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 240,
  steps: [
    {
      id: "weigh",
      text: { bn: "ক্রাশে তুলে ওজন নিন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "কেজি" },
          min: 20,
          max: 1200,
        },
      ],
      skipReasons: [{ bn: "ক্রাশে ওঠেনি" }],
      effect: { kind: "weigh_in" },
    },
  ],
});

const setup = async () => {
  const clock = new FakeClock("2027-03-01T07:30:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  const vet = await createTestClient(appRouter, { as: "vet", clock });
  const shed = await owner.client.herd.createShed({ name: `ready-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `বিক্রয় ${suffix}`,
  });
  /** The treated bull stands apart, because a campaign doses every animal in its Pen. */
  const treatedPen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `চিকিৎসা ${suffix}`,
  });

  const bull = async (
    targetWeightKg: number,
    windowStart: string,
    penId = pen.id
  ) =>
    await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `হাট ${suffix}` },
      purchasePriceBdt: 90_000,
      weightKg: 250,
      estimatedAgeMonths: 24,
      targetWeightKg,
      targetWindowStart: windowStart,
      targetWindowEnd: windowStart,
    });
  const bulls = [
    // Reaches 300 kg long before his window opens: suggested on weight.
    await bull(300, "2027-05-17"),
    // Nowhere near 500 kg, but his window opens the day after the round below.
    await bull(500, "2027-03-16"),
    // Wormed, and so not fit for meat for a fortnight whatever he weighs.
    await bull(300, "2027-05-17", treatedPen.id),
  ];

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
    .values(
      [pen.id, treatedPen.id].map((penId) => ({
        id: `pa-ready-${penId}`,
        farmId: TEST_FARM.id,
        userId: "test-staff",
        penId,
      }))
    )
    .onConflictDoNothing();

  const sop = await owner.client.sops.create({ content: weighInSop() });
  return { owner, manager, pen, treatedPen, bulls, sop, campaign };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** This file's SOP applies to the whole Fattening side, so it raises a round in every pen
 *  holding one. Retiring it stops new ones; what it already raised has to be shut. */
afterAll(async () => {
  const { eq, inArray } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { sopInstance } = await import("@OpenFarm/db/schema/instance");
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(
      inArray(sopDefinition.id, [
        world.sop.definitionId,
        world.campaign.definitionId,
      ])
    );
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.definitionId, world.sop.definitionId),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
});

const weigh = async (day: string, readings: [number, number][]) => {
  const clock = new FakeClock(`${day}T07:30:00.000Z`);
  const scheduler = await createTestClient(appRouter, { as: "owner", clock });
  await scheduler.client.instances.ensureDue();
  const today = await scheduler.client.instances.today({ penId: world.pen.id });
  const instance = today.find(
    (candidate) => candidate.definitionId === world.sop.definitionId
  );
  if (!instance) {
    throw new Error("expected a weigh-in instance");
  }
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  await staff.client.instances.claim({ id: instance.id });
  for (const [index, kg] of readings) {
    // oxlint-disable-next-line no-await-in-loop
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "weigh",
      animalTag: world.bulls[index]?.tagNumber ?? "",
      evidence: [kg],
    });
  }
};

/** The worming campaign, raised by hand over the treated Pen: it has no trigger, because the
 *  farm worms when it decides to and not when the clock says. */
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
    animalTag: world.bulls[2]?.tagNumber ?? "",
    evidence: [true],
  });
};

const tagOf = (index: number) => world.bulls[index]?.tagNumber ?? "";
const asManager = (day: string) =>
  createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock(`${day}T09:00:00.000Z`),
  });

describe("ready for sale", () => {
  it("suggests on the weight, and the Manager is the one who decides", async () => {
    // 250 off the lorry on 1 March; 305 a fortnight later, past his 300 kg target.
    await weigh("2027-03-15", [
      [0, 305],
      [1, 268],
    ]);
    await worm("2027-03-15");
    const manager = await asManager("2027-03-15");

    const suggested = await manager.client.ready.suggestions();
    const him = suggested.find((row) => row.tagNumber === tagOf(0));
    expect(him?.because).toBe("weight");

    // The one still 230 kg short of his target is not suggested for his weight.
    expect(
      suggested.find((row) => row.tagNumber === tagOf(1))?.because
    ).not.toBe("weight");

    // Confirming is the State change. A suggestion on its own moves nothing.
    const before = await manager.client.animals.byTag({ tagNumber: tagOf(0) });
    expect(before.state).toBe("quarantine");
    await manager.client.animals.setState({
      tagNumber: tagOf(0),
      state: "fattening",
    });
    await manager.client.ready.confirm({ tagNumber: tagOf(0) });
    const after = await manager.client.animals.byTag({ tagNumber: tagOf(0) });
    expect(after.state).toBe("ready_for_sale");
  });

  it("suggests when the window opens, whatever she weighs", async () => {
    // His window opens on 16 March and he is nowhere near 500 kg.
    const manager = await asManager("2027-03-16");
    const suggested = await manager.client.ready.suggestions();
    expect(suggested.find((row) => row.tagNumber === tagOf(1))?.because).toBe(
      "window"
    );
  });

  it("will not let a milker decide, and will not sell a treated animal", async () => {
    const clock = new FakeClock("2027-03-16T09:00:00.000Z");
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    await expect(
      staff.client.ready.confirm({ tagNumber: tagOf(1) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Wormed on 15 March, and the product holds meat for fourteen days.
    const manager = await asManager("2027-03-16");
    await manager.client.animals.setState({
      tagNumber: tagOf(2),
      state: "fattening",
    });
    await expect(
      manager.client.ready.confirm({ tagNumber: tagOf(2) })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "meat_withdrawal" },
    });
    // And the refusal says the day he is fit, because "not yet" without a date is not an
    // answer anybody can plan around.
    const refused = await manager.client.ready
      .confirm({ tagNumber: tagOf(2) })
      .catch((error: { data?: { fitOn?: string } }) => error);
    expect((refused as { data: { fitOn: string } }).data.fitOn).toContain(
      "2027-03-29"
    );
  });

  it("stops shouting about one the Manager has already considered", async () => {
    const manager = await asManager("2027-03-17");
    // His window is open and the Manager has looked at him and wants another month on him.
    await manager.client.ready.setAside({
      tagNumber: tagOf(1),
      because: "window",
      reason: "আরও এক মাস খাওয়াতে চাই",
    });

    const quiet = await manager.client.ready.suggestions();
    expect(quiet.find((row) => row.tagNumber === tagOf(1))).toBeUndefined();

    // He is still on the board — set aside is not hidden, it is only no longer shouted.
    const board = await manager.client.fattening.board({ penId: world.pen.id });
    expect(board.find((row) => row.tagNumber === tagOf(1))).toBeDefined();
  });
});

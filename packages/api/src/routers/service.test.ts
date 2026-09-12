import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { HEAT } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Service: the event the whole rest of the breeding chain counts from.

const suffix = `${Date.now()}`;

const heatWatchSop = (): SopContent => ({
  name: { bn: `গরম পর্যবেক্ষণ ${suffix}`, en: "Heat watch" },
  purpose: { bn: "গরম হওয়া গাভী খুঁজে বের করা" },
  triggers: [],
  appliesTo: { side: "dairy" },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "look",
      text: { bn: "প্রতিটি গাভী দেখুন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: [
            { value: "nothing", label: { bn: "কিছু না" } },
            { value: HEAT, label: { bn: "গরম হয়েছে" } },
          ],
        },
      ],
      skipReasons: [{ bn: "পাওয়া যায়নি" }],
      effect: { kind: "observation" },
    },
  ],
});

/** The AI work a Heat raises, whose one Step records the Service itself. */
const aiSop = (): SopContent => ({
  name: { bn: `প্রজনন ${suffix}`, en: "Service" },
  purpose: { bn: "গরম হওয়া গাভীকে সময়মতো প্রজনন" },
  triggers: [{ kind: "event", event: "heat" }],
  appliesTo: { side: "dairy" },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 60,
  steps: [
    {
      id: "serve",
      text: { bn: "প্রজনন করান" },
      repeatPerAnimal: false,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: [
            { value: "ai", label: { bn: "কৃত্রিম প্রজনন" } },
            { value: "natural", label: { bn: "ষাঁড় দিয়ে" } },
          ],
        },
        // The sire: a straw's number for AI, or the farm's own bull by his Tag Number.
        { type: "note", required: true },
        // Who actually served her — a technician or a vet, rarely somebody with an account.
        { type: "note", required: false },
      ],
      skipReasons: [],
      effect: { kind: "service" },
    },
  ],
});

/** A bull running with the herd serves cows nobody saw in heat. The round that walks the Pen
 *  afterwards is where those services are written down — no heat raised this work. */
const bullRunSop = (): SopContent => ({
  ...aiSop(),
  name: { bn: `ষাঁড়ের সঙ্গে ${suffix}`, en: "Bull run" },
  purpose: { bn: "ষাঁড় যেসব গাভীকে পাল দিয়েছে তা লেখা" },
  triggers: [],
  steps: [
    {
      ...(aiSop().steps[0] as SopContent["steps"][number]),
      id: "served",
      repeatPerAnimal: true,
      skipReasons: [{ bn: "পাল দেয়নি" }],
    },
  ],
});

const setup = async () => {
  const clock = new FakeClock("2027-11-01T00:00:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  const shed = await owner.client.herd.createShed({ name: `serve-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `প্রজনন ${suffix}`,
  });
  const heifer = async () =>
    await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
  const cows = [];
  for (let index = 0; index < 5; index += 1) {
    // oxlint-disable-next-line no-await-in-loop
    cows.push(await heifer());
  }
  // The farm's own bull, for a natural service.
  const bull = await manager.client.intake.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceBdt: 150_000,
    weightKg: 480,
    estimatedAgeMonths: 36,
  });

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-serve-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();

  const watch = await owner.client.sops.create({ content: heatWatchSop() });
  const ai = await owner.client.sops.create({ content: aiSop() });
  const bullRun = await owner.client.sops.create({ content: bullRunSop() });
  return { owner, pen, cows, bull, watch, ai, bullRun };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const { and, eq, inArray } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { sopInstance } = await import("@OpenFarm/db/schema/instance");
  const db = scratchDb();
  const mine = [
    world.watch.definitionId,
    world.ai.definitionId,
    world.bullRun.definitionId,
  ];
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(inArray(sopDefinition.id, mine));
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        inArray(sopInstance.definitionId, mine),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
  await db
    .delete(penAssignment)
    .where(eq(penAssignment.id, `pa-serve-${world.pen.id}`));
});

const tagOf = (index: number) => world.cows[index]?.tagNumber ?? "";

/** She is seen in heat on the morning round, and her AI work is raised. */
const inHeat = async (day: string, tagNumber: string) => {
  const clock = new FakeClock(`${day}T00:00:00.000Z`);
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  await manager.client.instances.raiseNow({
    definitionId: world.watch.definitionId,
    penId: world.pen.id,
  });
  const rounds = await manager.client.instances.today({ penId: world.pen.id });
  const round = rounds.find(
    (row) => row.definitionId === world.watch.definitionId
  );
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  await staff.client.instances.claim({ id: round?.id ?? "" });
  await staff.client.instances.completeStep({
    instanceId: round?.id ?? "",
    stepId: "look",
    animalTag: tagNumber,
    evidence: [HEAT],
  });
  await manager.client.instances.ensureDue();
  const her = await manager.client.animals.byTag({ tagNumber });
  const work = await manager.client.instances.today({ penId: world.pen.id });
  const ai = work.find(
    (row) =>
      row.definitionId === world.ai.definitionId && row.animalId === her.id
  );
  if (!ai) {
    throw new Error("expected AI work for her");
  }
  return ai.id;
};

describe("the service", () => {
  it("records an AI service as the AI work the heat raised, done", async () => {
    const workId = await inHeat("2027-11-02", tagOf(0));
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2027-11-02T13:00:00.000Z"),
    });
    await manager.client.instances.claim({ id: workId });
    await manager.client.instances.completeStep({
      instanceId: workId,
      stepId: "serve",
      evidence: ["ai", "HF-2231-BD", "রহিম (এআই টেকনিশিয়ান)"],
    });
    await manager.client.instances.complete({ id: workId });

    const her = await manager.client.animals.byTag({ tagNumber: tagOf(0) });
    expect(her.services).toHaveLength(1);
    expect(her.services[0]).toMatchObject({
      method: "ai",
      sireStraw: "HF-2231-BD",
      sireTagNumber: null,
      servedBy: "রহিম (এআই টেকনিশিয়ান)",
    });
    // Her page reads as a chain: the service knows which heat it answered.
    expect(her.services[0]?.heatId).toBe(her.heats[0]?.id);

    // And the work is done, not closed beside it — nobody is sent to serve a cow who has been.
    const board = await manager.client.instances.get({ id: workId });
    expect(board.state).toBe("completed");
  });

  it("records a natural service by the farm's own bull", async () => {
    const workId = await inHeat("2027-11-03", tagOf(1));
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2027-11-03T13:00:00.000Z"),
    });
    await manager.client.instances.claim({ id: workId });
    await manager.client.instances.completeStep({
      instanceId: workId,
      stepId: "serve",
      evidence: ["natural", world.bull.tagNumber, ""],
    });

    const her = await manager.client.animals.byTag({ tagNumber: tagOf(1) });
    expect(her.services[0]).toMatchObject({
      method: "natural",
      sireStraw: null,
      sireTagNumber: world.bull.tagNumber,
    });
  });

  it("records a natural service that no heat went before", async () => {
    // The bull runs with the herd and serves a cow nobody saw in heat. The round that walks the
    // Pen afterwards writes it down, on work no heat raised.
    const clock = new FakeClock("2027-11-06T09:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await manager.client.instances.raiseNow({
      definitionId: world.bullRun.definitionId,
      penId: world.pen.id,
    });
    const today = await manager.client.instances.today({ penId: world.pen.id });
    const round = today.find(
      (row) => row.definitionId === world.bullRun.definitionId
    );
    await manager.client.instances.claim({ id: round?.id ?? "" });
    await manager.client.instances.completeStep({
      instanceId: round?.id ?? "",
      stepId: "served",
      animalTag: tagOf(4),
      evidence: ["natural", world.bull.tagNumber, ""],
    });

    const her = await manager.client.animals.byTag({ tagNumber: tagOf(4) });
    expect(her.services).toHaveLength(1);
    expect(her.services[0]).toMatchObject({
      method: "natural",
      sireTagNumber: world.bull.tagNumber,
      // No heat raised it, and the record does not pretend one did.
      heatId: null,
    });

    // A bull is not served. Recorded against him, a service would be a service of nothing, and
    // everything that counts from it would be counting from a mistake.
    await expect(
      manager.client.instances.completeStep({
        instanceId: round?.id ?? "",
        stepId: "served",
        animalTag: world.bull.tagNumber,
        evidence: ["natural", world.bull.tagNumber, ""],
      })
    ).rejects.toMatchObject({ data: { refusal: "service_of_a_male" } });
  });

  it("asks who served her when it was AI", async () => {
    // The story asks for the technician. A bull has nobody standing over him, but a straw does.
    const clock = new FakeClock("2027-11-06T10:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const today = await manager.client.instances.today({ penId: world.pen.id });
    const round = today.find(
      (row) => row.definitionId === world.bullRun.definitionId
    );
    await expect(
      manager.client.instances.completeStep({
        instanceId: round?.id ?? "",
        stepId: "served",
        animalTag: tagOf(3),
        evidence: ["ai", "HF-3300", ""],
      })
    ).rejects.toMatchObject({
      data: { refusal: "service_needs_technician" },
    });
  });

  it("will not take a bull the farm does not have", async () => {
    const workId = await inHeat("2027-11-04", tagOf(2));
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2027-11-04T13:00:00.000Z"),
    });
    await manager.client.instances.claim({ id: workId });
    // A natural service names a bull standing on this farm. A tag that is not one is a sire
    // nobody can trace, and parentage is the whole reason the record exists.
    await expect(
      manager.client.instances.completeStep({
        instanceId: workId,
        stepId: "serve",
        evidence: ["natural", "D-9999", ""],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is the Manager's alone to record, the Owner included", async () => {
    // Her own heat and her own unclaimed work, so nothing but the Role stands in the way.
    const workId = await inHeat("2027-11-05", tagOf(3));
    const clock = new FakeClock("2027-11-05T13:00:00.000Z");

    // Not the milker's and not the Vet's: the roles matrix gives them no part in a Service. The
    // work is the Manager's, so the Step's own gate turns them away before the Service is asked.
    for (const as of ["staff", "vet"] as const) {
      // Sequential: each refusal is read before the next person tries.
      // oxlint-disable-next-line no-await-in-loop
      const other = await createTestClient(appRouter, { as, clock });
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        other.client.instances.completeStep({
          instanceId: workId,
          stepId: "serve",
          evidence: ["ai", "HF-1100", "রহিম"],
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }

    // The Owner may always step into a shift — someone has to be able to unstick one — so the
    // step's own gate lets them in. But the roles matrix gives the Owner only read on a Service,
    // and parentage recorded by the wrong hand is parentage nobody can trust. An Owner who does
    // the breeding holds the Manager's role as well, and records it under that.
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    await expect(
      owner.client.instances.completeStep({
        instanceId: workId,
        stepId: "serve",
        evidence: ["ai", "HF-1100", "রহিম"],
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { refusal: "manager_only" },
    });
  });

  it("will not publish a procedure that hands a service to Barn Staff", async () => {
    // Whoever the work is assigned to completes it. A service procedure assigned to the milkers
    // would give them parentage the day it went out, so it does not go out.
    const owner = await createTestClient(appRouter, { as: "owner" });
    await expect(
      owner.client.sops.create({
        content: {
          ...aiSop(),
          name: { bn: `ভুল প্রজনন ${suffix}` },
          assignedRole: "staff",
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { HEAT } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm, thePerson } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Two ways a pregnancy ends without a calf: an Abortion the Vet records, and a cow who does not
// take, time after time, until somebody has to decide about her.

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

const aiSop = (): SopContent => ({
  name: { bn: `পাল দেওয়া ${suffix}`, en: "Service" },
  purpose: { bn: "গরম হওয়া গাভীকে সময়মতো পাল দেওয়া" },
  triggers: [{ kind: "event", event: "heat" }],
  appliesTo: { side: "dairy" },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 60,
  steps: [
    {
      id: "serve",
      text: { bn: "পাল দিন" },
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
        { type: "note", required: true },
        { type: "note", required: false },
        { type: "datetime", required: true },
      ],
      skipReasons: [],
      effect: { kind: "service" },
    },
  ],
});

const prepSop = (penId: string): SopContent => ({
  name: { bn: `বাচ্চা দেওয়ার প্রস্তুতি ${suffix}`, en: "Calving prep" },
  purpose: { bn: "গাভীকে বাচ্চা দেওয়ার ঘরে নেওয়া" },
  triggers: [{ kind: "before_calving", lead: "calving_prep" }],
  appliesTo: { side: "dairy" },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "walk",
      text: { bn: "বাচ্চা দেওয়ার ঘরে নিন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: [{ value: penId, label: { bn: "বাচ্চা দেওয়ার ঘর" } }],
        },
      ],
      skipReasons: [{ bn: "পাওয়া যায়নি" }],
      effect: { kind: "move" },
    },
  ],
});

const setup = async () => {
  const clock = new FakeClock("2033-01-01T00:00:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const shed = await owner.client.herd.createShed({ name: `ab-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `প্রজনন ${suffix}`,
  });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-ab-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const carrying = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "pregnant_heifer",
    penId: pen.id,
    source: "bought",
    aliases: [],
    expectedCalvingOn: "2033-06-01",
  });
  const hardToSettle = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  const watch = await owner.client.sops.create({ content: heatWatchSop() });
  const ai = await owner.client.sops.create({ content: aiSop() });
  const prep = await owner.client.sops.create({ content: prepSop(pen.id) });
  return {
    pen,
    carrying: carrying.tagNumber,
    hardToSettle: hardToSettle.tagNumber,
    watch,
    ai,
    prep,
  };
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
    world.prep.definitionId,
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
    .where(eq(penAssignment.id, `pa-ab-${world.pen.id}`));
});

/** Seen in heat on `day` and served that noon, on the AI work her heat raised. */
const heatAndServe = async (day: string, tagNumber: string) => {
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

  const later = new FakeClock(`${day}T20:00:00.000Z`);
  const serving = await createTestClient(appRouter, {
    as: "manager",
    clock: later,
  });
  await serving.client.instances.ensureDue();
  const her = await serving.client.animals.byTag({ tagNumber });
  // Due at noon and late by evening, on the farm's previous day: it is on the Overdue list.
  const work = [
    ...(await serving.client.instances.today({ penId: world.pen.id })),
    ...(await serving.client.instances.overdue()),
  ];
  const aiWork = work.find(
    (row) =>
      row.definitionId === world.ai.definitionId && row.animalId === her.id
  );
  await serving.client.instances.claim({ id: aiWork?.id ?? "" });
  await serving.client.instances.completeStep({
    instanceId: aiWork?.id ?? "",
    stepId: "serve",
    evidence: ["ai", "HF-2231-BD", "রহিম", `${day}T12:00:00.000Z`],
  });
  await serving.client.instances.complete({ id: aiWork?.id ?? "" });
};

/** The Manager's queue of cows somebody has to decide about, as it reads at `at`. */
const repeatBreedersAt = async (at: string) => {
  const manager = await createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock(at),
  });
  const home = await manager.client.home.manager();
  return { rows: home.queue.repeatBreeders, manager };
};

describe("the abortion", () => {
  it("clears her pregnancy and takes back the work pulled towards her calving", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2033-03-01T04:00:00.000Z"),
    });
    await manager.client.instances.ensureDue();
    const before = await manager.client.animals.byTag({
      tagNumber: world.carrying,
    });
    const prep = await scratchDb().query.sopInstance.findFirst({
      where: { definitionId: world.prep.definitionId, animalId: before.id },
      columns: { id: true, state: true },
    });
    expect(prep?.state).toBe("due");

    // It is the Vet's to record: the Manager is refused.
    await expect(
      manager.client.breeding.recordAbortion({
        tagNumber: world.carrying,
        abortedAt: new Date("2033-03-01T02:00:00.000Z"),
        stageMonths: 6,
        note: "ব্রুসেলোসিস সন্দেহ",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const vet = await createTestClient(appRouter, {
      as: "vet",
      clock: new FakeClock("2033-03-01T04:00:00.000Z"),
    });
    const recorded = await vet.client.breeding.recordAbortion({
      tagNumber: world.carrying,
      abortedAt: new Date("2033-03-01T02:00:00.000Z"),
      stageMonths: 6,
      note: "ব্রুসেলোসিস সন্দেহ",
    });

    const her = await manager.client.animals.byTag({
      tagNumber: world.carrying,
    });
    // Back to a heifer the heat watch walks past every day, with no calving to expect.
    expect(her.state).toBe("heifer");
    expect(her.expectedCalvingAt).toBeNull();
    expect(her.abortions).toMatchObject([
      { stageMonths: 6, note: "ব্রুসেলোসিস সন্দেহ" },
    ]);
    const closed = await manager.client.instances.get({ id: prep?.id ?? "" });
    expect(closed.state).toBe("called_off");

    // The Vet puts the stage right, with a reason; the Manager may not.
    await expect(
      manager.client.breeding.correctAbortion({
        id: recorded.id,
        changes: { stageMonths: { from: 6, to: 5 } },
        reason: "ভুল লেখা",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Nor another Vet: an abortion is the Vet's own finding, and only the Vet who recorded it puts it right.
    const otherVet = await createTestClient(appRouter, {
      as: "otherVet",
      clock: vet.clock,
    });
    await expect(
      otherVet.client.breeding.correctAbortion({
        id: recorded.id,
        changes: { stageMonths: { from: 6, to: 4 } },
        reason: "আমার মনে হয় চার মাস",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { refusal: { word: "not_theirs" } },
    });
    await vet.client.breeding.correctAbortion({
      id: recorded.id,
      changes: { stageMonths: { from: 6, to: 5 } },
      reason: "আবার দেখে পাঁচ মাস মনে হয়েছে",
    });
    const corrected = await manager.client.animals.byTag({
      tagNumber: world.carrying,
    });
    expect(corrected.abortions[0]).toMatchObject({ stageMonths: 5 });

    // A cow who is not carrying has nothing to lose.
    await expect(
      vet.client.breeding.recordAbortion({
        tagNumber: world.carrying,
        abortedAt: new Date("2033-03-01T03:00:00.000Z"),
        stageMonths: 6,
        note: "আবার",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "abortion_of_a_cow_not_carrying" },
    });
  });
});

describe("the repeat breeder", () => {
  it("is raised on the Manager's queue at the third failed attempt and not before", async () => {
    // Served in three heats three weeks apart: the first two did not take, because she came back.
    await heatAndServe("2033-01-03", world.hardToSettle);
    await heatAndServe("2033-01-24", world.hardToSettle);
    await heatAndServe("2033-02-14", world.hardToSettle);
    const two = await repeatBreedersAt("2033-02-15T04:00:00.000Z");
    expect(
      two.rows.filter((row) => row.tagNumber === world.hardToSettle)
    ).toHaveLength(0);

    // A fourth heat: the third attempt did not take either.
    await heatAndServe("2033-03-07", world.hardToSettle);
    const three = await repeatBreedersAt("2033-03-08T04:00:00.000Z");
    const flag = three.rows.find((row) => row.tagNumber === world.hardToSettle);
    expect(flag?.failedAttempts).toBe(3);
    // With what she has failed at: the first service of each attempt that did not take.
    expect(flag?.failures.map((one) => one.servedAt.toISOString())).toEqual([
      "2033-01-03T12:00:00.000Z",
      "2033-01-24T12:00:00.000Z",
      "2033-02-14T12:00:00.000Z",
    ]);
    // How each went, and why it counts: she came back into heat before anybody checked her.
    expect(flag?.failures[0]).toMatchObject({
      method: "ai",
      sire: "HF-2231-BD",
      servedBy: "রহিম",
      why: "back_in_heat",
    });
    // Never a State change.
    const her = await three.manager.client.animals.byTag({
      tagNumber: world.hardToSettle,
    });
    expect(her.state).toBe("heifer");
  });

  it("stays until somebody answers it, and comes back when she fails again", async () => {
    const weekOn = await repeatBreedersAt("2033-03-15T04:00:00.000Z");
    expect(
      weekOn.rows.filter((row) => row.tagNumber === world.hardToSettle)
    ).toHaveLength(1);

    // The Vet reads the same question, and may decide it too.
    const vet = await createTestClient(appRouter, {
      as: "vet",
      clock: new FakeClock("2033-03-15T05:00:00.000Z"),
    });
    const vetsList = await vet.client.breeding.repeatBreeders();
    expect(vetsList.map((row) => row.tagNumber)).toContain(world.hardToSettle);

    // The Owner may read the queue but does not answer it.
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2033-03-15T05:00:00.000Z"),
    });
    await expect(
      owner.client.breeding.answerRepeatBreeder({
        tagNumber: world.hardToSettle,
        decision: "serve_again",
        note: "আরেকবার দেখি",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await weekOn.manager.client.breeding.answerRepeatBreeder({
      tagNumber: world.hardToSettle,
      decision: "serve_again",
      note: "ভেট দেখেছেন, আরেকবার দেখি",
    });
    // Answered once is answered: a second tap finds nothing waiting.
    await expect(
      weekOn.manager.client.breeding.answerRepeatBreeder({
        tagNumber: world.hardToSettle,
        decision: "cull",
        note: "দুবার চাপা",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "not_a_repeat_breeder" },
    });
    const answered = await repeatBreedersAt("2033-03-16T04:00:00.000Z");
    expect(
      answered.rows.filter((row) => row.tagNumber === world.hardToSettle)
    ).toHaveLength(0);

    // Served again, and back in heat: a failure nobody has answered for yet.
    await heatAndServe("2033-03-28", world.hardToSettle);
    const again = await repeatBreedersAt("2033-03-29T04:00:00.000Z");
    const flag = again.rows.find((row) => row.tagNumber === world.hardToSettle);
    expect(flag?.failedAttempts).toBe(4);
    expect(flag?.lastAnswer).toMatchObject({ decision: "serve_again" });
  });
});

import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { HEAT } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Expected Calving, and the work it pulls towards it: drying her off sixty days out, and walking her
// to the calving pen seven days out. Counted backwards from a date the farm worked out.

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

const checkSop = (): SopContent => ({
  name: { bn: `গর্ভ পরীক্ষা ${suffix}`, en: "Pregnancy check" },
  purpose: { bn: "গাভী গর্ভবতী কিনা দেখা" },
  triggers: [{ kind: "event", event: "service" }],
  appliesTo: { side: "dairy" },
  assignedRole: "vet",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "check",
      text: { bn: "গর্ভ পরীক্ষা করুন" },
      repeatPerAnimal: false,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: [
            { value: "positive", label: { bn: "গর্ভবতী" } },
            { value: "negative", label: { bn: "গর্ভবতী নয়" } },
          ],
        },
      ],
      skipReasons: [],
      effect: { kind: "pregnancy_check" },
    },
  ],
});

/** Sixty days before her Expected Calving, a milking cow is dried off. */
const dryOffSop = (): SopContent => ({
  name: { bn: `দুধ বন্ধ ${suffix}`, en: "Dry-off" },
  purpose: { bn: "বাচ্চা দেওয়ার আগে গাভীর দুধ বন্ধ করা" },
  triggers: [{ kind: "before_calving", lead: "dry_off" }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "dry",
      text: { bn: "দুধ দোয়ানো বন্ধ করুন" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "পাওয়া যায়নি" }],
      effect: { kind: "dry_off" },
    },
  ],
});

/** Seven days before her Expected Calving, she is walked to the calving pen. */
const prepSop = (calvingPenId: string): SopContent => ({
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
          choices: [{ value: calvingPenId, label: { bn: "বাচ্চা দেওয়ার ঘর" } }],
        },
      ],
      skipReasons: [{ bn: "পাওয়া যায়নি" }],
      effect: { kind: "move" },
    },
  ],
});

const setup = async () => {
  const clock = new FakeClock("2031-01-01T00:00:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const shed = await owner.client.herd.createShed({ name: `cw-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `দুধের ঘর ${suffix}`,
  });
  const calvingPen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `বাচ্চার ঘর ${suffix}`,
  });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values(
      [pen.id, calvingPen.id].map((penId) => ({
        id: `pa-cw-${penId}`,
        farmId: TEST_FARM.id,
        userId: "test-staff",
        penId,
      }))
    )
    .onConflictDoNothing();
  // Two milking cows from the opening register: one the farm will serve, and one already carrying
  // when the register opened.
  const imported = await owner.client.animals.importRegister({
    csv: [
      "sex,side,state,pen,source,expected_calving",
      `female,dairy,milking,দুধের ঘর ${suffix},bought,`,
      `female,dairy,milking,দুধের ঘর ${suffix},bought,2031-09-01`,
      `female,dairy,milking,দুধের ঘর ${suffix},bought,`,
      `female,dairy,milking,দুধের ঘর ${suffix},bought,2031-01-31`,
    ].join("\n"),
  });
  const [homeBred, alreadyCarrying, mistaken, nearlyDue] = imported.imported;
  const watch = await owner.client.sops.create({ content: heatWatchSop() });
  const ai = await owner.client.sops.create({ content: aiSop() });
  const check = await owner.client.sops.create({ content: checkSop() });
  const dryOff = await owner.client.sops.create({ content: dryOffSop() });
  const prep = await owner.client.sops.create({
    content: prepSop(calvingPen.id),
  });
  return {
    owner,
    pen,
    calvingPen,
    homeBred: homeBred?.tagNumber ?? "",
    alreadyCarrying: alreadyCarrying?.tagNumber ?? "",
    mistaken: mistaken?.tagNumber ?? "",
    nearlyDue: nearlyDue?.tagNumber ?? "",
    imported,
    watch,
    ai,
    check,
    dryOff,
    prep,
  };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const { and, inArray } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { sopInstance } = await import("@OpenFarm/db/schema/instance");
  const db = scratchDb();
  const mine = [
    world.watch.definitionId,
    world.ai.definitionId,
    world.check.definitionId,
    world.dryOff.definitionId,
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
    .where(
      inArray(penAssignment.id, [
        `pa-cw-${world.pen.id}`,
        `pa-cw-${world.calvingPen.id}`,
      ])
    );
});

/** One procedure's open work about one animal, today's and any still waiting, seen at `at`. */
const workFor = async (
  at: string,
  definitionId: string,
  tagNumber: string,
  as: "manager" | "vet" | "staff" = "manager"
) => {
  const clock = new FakeClock(at);
  const client = await createTestClient(appRouter, { as, clock });
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  await manager.client.instances.ensureDue();
  const her = await manager.client.animals.byTag({ tagNumber });
  const pens = [world.pen.id, world.calvingPen.id];
  const today = [];
  for (const penId of pens) {
    // oxlint-disable-next-line no-await-in-loop
    today.push(...(await manager.client.instances.today({ penId })));
  }
  const late = await manager.client.instances.overdue();
  const seen = new Set<string>();
  const rows = [...today, ...late].filter((row) => {
    const mine =
      row.definitionId === definitionId &&
      row.animalId === her.id &&
      !seen.has(row.id);
    seen.add(row.id);
    return mine;
  });
  return { rows, client, manager, her };
};

/** She is seen in heat, served, and forty-five days later found carrying. */
const getHerInCalf = async (tagNumber: string, day = "01-02") => {
  const clock = new FakeClock(`2031-${day}T00:00:00.000Z`);
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

  const serving = await workFor(
    `2031-${day}T20:00:00.000Z`,
    world.ai.definitionId,
    tagNumber
  );
  const aiWork = serving.rows[0]?.id ?? "";
  await serving.manager.client.instances.claim({ id: aiWork });
  await serving.manager.client.instances.completeStep({
    instanceId: aiWork,
    stepId: "serve",
    evidence: ["ai", "HF-2231-BD", "রহিম", `2031-${day}T12:00:00.000Z`],
  });

  const served = new Date(`2031-${day}T12:00:00.000Z`);
  const checkDay = new Date(served.getTime() + 45 * 24 * 60 * 60 * 1000);
  const checking = await workFor(
    `${checkDay.toISOString().slice(0, 10)}T04:00:00.000Z`,
    world.check.definitionId,
    tagNumber,
    "vet"
  );
  const checkWork = checking.rows[0]?.id ?? "";
  await checking.client.client.instances.claim({ id: checkWork });
  await checking.client.client.instances.completeStep({
    instanceId: checkWork,
    stepId: "check",
    evidence: ["positive"],
  });
  return { checkWork, vet: checking.client };
};

describe("the work Expected Calving pulls towards it", () => {
  it("dries a home-bred cow off sixty days out, and walks her to the calving pen seven days out", async () => {
    await getHerInCalf(world.homeBred);
    // Served at noon on 2 January; 283 days on is noon on 12 October.

    // Sixty days before is 13 August, on the farm's clock.
    const drying = await workFor(
      "2031-08-13T03:00:00.000Z",
      world.dryOff.definitionId,
      world.homeBred,
      "staff"
    );
    expect(drying.rows.map((row) => row.dueAt.toISOString())).toEqual([
      "2031-08-12T18:00:00.000Z",
    ]);
    const dryWork = drying.rows[0]?.id ?? "";
    await drying.client.client.instances.claim({ id: dryWork });
    await drying.client.client.instances.completeStep({
      instanceId: dryWork,
      stepId: "dry",
      animalTag: world.homeBred,
      evidence: [true],
    });
    const dried = await drying.manager.client.animals.byTag({
      tagNumber: world.homeBred,
    });
    expect(dried.state).toBe("dry");

    // Seven days before is 5 October.
    const prepping = await workFor(
      "2031-10-05T03:00:00.000Z",
      world.prep.definitionId,
      world.homeBred,
      "staff"
    );
    expect(prepping.rows.map((row) => row.dueAt.toISOString())).toEqual([
      "2031-10-04T18:00:00.000Z",
    ]);
    const prepWork = prepping.rows[0]?.id ?? "";
    await prepping.client.client.instances.claim({ id: prepWork });
    await prepping.client.client.instances.completeStep({
      instanceId: prepWork,
      stepId: "walk",
      animalTag: world.homeBred,
      evidence: [world.calvingPen.id],
    });
    const walked = await prepping.manager.client.animals.byTag({
      tagNumber: world.homeBred,
    });
    expect(walked.penId).toBe(world.calvingPen.id);
  });

  it("asks a heifer bought in carrying when she will calve, and raises the same work for her", async () => {
    const at = new FakeClock("2031-03-01T04:00:00.000Z");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: at,
    });
    const heifer = {
      sex: "female" as const,
      side: "dairy" as const,
      state: "pregnant_heifer" as const,
      penId: world.pen.id,
      source: "bought" as const,
      aliases: [],
    };
    // Bought in carrying and nobody asked when: refused, because nothing would ever fall due.
    await expect(manager.client.animals.register(heifer)).rejects.toMatchObject(
      { code: "BAD_REQUEST", data: { refusal: "expected_calving_needed" } }
    );
    // A day already gone is not a calving the farm can expect.
    await expect(
      manager.client.animals.register({
        ...heifer,
        expectedCalvingOn: "2031-02-01",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { tagNumber } = await manager.client.animals.register({
      ...heifer,
      expectedCalvingOn: "2031-06-01",
    });

    // Expected to calve on the farm's 1 June, she is walked to the calving pen on 25 May — and, not being in milk,
    // there is nothing to dry off.
    const prepping = await workFor(
      "2031-05-25T03:00:00.000Z",
      world.prep.definitionId,
      tagNumber
    );
    expect(prepping.rows.map((row) => row.dueAt.toISOString())).toEqual([
      "2031-05-24T18:00:00.000Z",
    ]);
    const drying = await workFor(
      "2031-05-25T03:00:00.000Z",
      world.dryOff.definitionId,
      tagNumber
    );
    expect(drying.rows).toHaveLength(0);
    expect(prepping.her.expectedCalvingAt?.toISOString()).toBe(
      "2031-05-31T18:00:00.000Z"
    );
  });

  it("moves open work with a corrected Expected Calving, and leaves finished work alone", async () => {
    // On the opening register as expected to calve on 1 September: dried off on 3 July.
    const drying = await workFor(
      "2031-07-03T03:00:00.000Z",
      world.dryOff.definitionId,
      world.alreadyCarrying,
      "staff"
    );
    expect(drying.rows.map((row) => row.dueAt.toISOString())).toEqual([
      "2031-07-02T18:00:00.000Z",
    ]);
    const dryWork = drying.rows[0]?.id ?? "";
    await drying.client.client.instances.claim({ id: dryWork });
    await drying.client.client.instances.completeStep({
      instanceId: dryWork,
      stepId: "dry",
      animalTag: world.alreadyCarrying,
      evidence: [true],
    });
    await drying.client.client.instances.complete({ id: dryWork });

    // The register had her calving ten days early. Put right, her calving prep follows the date.
    const clock = new FakeClock("2031-07-04T04:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const before = await workFor(
      "2031-07-04T04:00:00.000Z",
      world.prep.definitionId,
      world.alreadyCarrying
    );
    const raisedPrep = await scratchDb().query.sopInstance.findFirst({
      where: { definitionId: world.prep.definitionId, animalId: before.her.id },
      columns: { id: true },
    });
    const prepWork = await manager.client.instances.get({
      id: raisedPrep?.id ?? "",
    });
    expect(prepWork.dueAt.toISOString()).toBe("2031-08-24T18:00:00.000Z");

    await manager.client.animals.correctExpectedCalving({
      tagNumber: world.alreadyCarrying,
      expectedCalvingOn: "2031-09-11",
      reason: "রেজিস্টারে তারিখ ভুল ছিল",
    });

    const moved = await manager.client.instances.get({ id: prepWork.id });
    expect(moved.dueAt.toISOString()).toBe("2031-09-03T18:00:00.000Z");
    expect(moved.state).toBe("due");
    const done = await manager.client.instances.get({ id: dryWork });
    expect(done.state).toBe("completed");
    expect(done.dueAt.toISOString()).toBe("2031-07-02T18:00:00.000Z");

    // The trail says the day changed, why, and which work went with it.
    const [event] = await scratchDb().query.auditEvent.findMany({
      where: { entity: "animal", entityId: before.her.id, action: "correct" },
      orderBy: { receivedAt: "desc", id: "desc" },
      limit: 1,
    });
    expect(event?.reason).toBe("রেজিস্টারে তারিখ ভুল ছিল");
    expect(event?.after).toMatchObject({
      expectedCalvingAt: "2031-09-10T18:00:00.000Z",
      workMoved: [
        {
          instanceId: prepWork.id,
          from: "2031-08-24T18:00:00.000Z",
          to: "2031-09-03T18:00:00.000Z",
        },
      ],
    });
  });

  it("will not let an Expected Calving worked out from a check be typed over", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2031-10-06T04:00:00.000Z"),
    });
    await expect(
      manager.client.animals.correctExpectedCalving({
        tagNumber: world.homeBred,
        expectedCalvingOn: "2031-10-20",
        reason: "অনুমান",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "calving_is_derived" },
    });
  });

  it("closes the calving work when the positive it came from is put right", async () => {
    // Served on 9 January and found carrying on 23 February: her dry-off is raised for 20 August.
    const { checkWork, vet } = await getHerInCalf(world.mistaken, "01-09");
    const board = await vet.client.instances.get({ id: checkWork });
    const entry = board.completions.find((row) => row.stepId === "check");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2031-02-24T04:00:00.000Z"),
    });
    await manager.client.instances.ensureDue();
    const raised = await scratchDb().query.sopInstance.findMany({
      where: {
        definitionId: {
          in: [world.dryOff.definitionId, world.prep.definitionId],
        },
        animalId: board.animalId ?? "",
      },
      columns: { id: true, state: true },
    });
    expect(raised.map((work) => work.state)).toEqual(["due", "due"]);

    // The Vet looked at the wrong cow.
    await vet.client.instances.correctStep({
      completionId: entry?.id ?? "",
      evidence: ["negative"],
      reason: "ভুল গাভী দেখা হয়েছিল",
    });

    const her = await manager.client.animals.byTag({
      tagNumber: world.mistaken,
    });
    expect(her.expectedCalvingAt).toBeNull();
    for (const work of raised) {
      // Sequential, reading each piece of work back.
      // oxlint-disable-next-line no-await-in-loop
      const now = await manager.client.instances.get({ id: work.id });
      expect(now.state).toBe("missed");
    }
    // And the correction's own entry in the trail says which work it closed.
    const [event] = await scratchDb().query.auditEvent.findMany({
      where: {
        entity: "step_completion",
        entityId: entry?.id ?? "",
        action: "correct",
      },
      orderBy: { receivedAt: "desc", id: "desc" },
      limit: 1,
    });
    const trail = event?.after as
      | { effect: { workClosed: string[] } }
      | undefined;
    expect((trail?.effect.workClosed ?? []).toSorted()).toEqual(
      raised.map((work) => work.id).toSorted()
    );

    // She was carrying after all. The same calving, so the same work comes back on its day.
    await vet.client.instances.correctStep({
      completionId: entry?.id ?? "",
      evidence: ["positive"],
      reason: "আবার দেখে গর্ভবতী পাওয়া গেছে",
    });
    for (const work of raised) {
      // Sequential, reading each piece of work back.
      // oxlint-disable-next-line no-await-in-loop
      const back = await manager.client.instances.get({ id: work.id });
      expect(back.state).toBe("due");
    }
  });

  it("dries off a cow who arrives close to calving, late, and stops once she has calved", async () => {
    // On the register on 1 January, due on 31 January: her dry-off fell on 2 December, before she
    // was ever on this farm. She is still in milk and carrying, so it is raised, and it is late.
    const drying = await workFor(
      "2031-01-02T03:00:00.000Z",
      world.dryOff.definitionId,
      world.nearlyDue
    );
    expect(drying.rows.map((row) => row.dueAt.toISOString())).toEqual([
      "2030-12-01T18:00:00.000Z",
    ]);

    // She calves on the 25th, recorded by hand, before anybody walked her anywhere.
    const clock = new FakeClock("2031-01-25T06:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    // Dried off by hand that morning, so the dry-off Step written up later dries nobody — and putting
    // that entry right as a skip has nothing to undo and nobody to ask.
    const earlier = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2031-01-25T01:00:00.000Z"),
    });
    await earlier.client.animals.setState({
      tagNumber: world.nearlyDue,
      state: "dry",
    });
    const dryWork = drying.rows[0]?.id ?? "";
    await manager.client.instances.claim({ id: dryWork });
    await manager.client.instances.completeStep({
      instanceId: dryWork,
      stepId: "dry",
      animalTag: world.nearlyDue,
      evidence: [true],
    });
    const board = await manager.client.instances.get({ id: dryWork });
    const entry = board.completions.find((row) => row.stepId === "dry");
    const corrected = await manager.client.instances.correctStep({
      completionId: entry?.id ?? "",
      skipReason: "পাওয়া যায়নি",
      reason: "হাতে আগেই দুধ বন্ধ করা হয়েছিল",
    });
    expect(corrected.needsReview).toBe(false);
    const prep = await workFor(
      "2031-01-25T06:00:00.000Z",
      world.prep.definitionId,
      world.nearlyDue
    );
    expect(prep.rows).toHaveLength(1);
    await manager.client.animals.setState({
      tagNumber: world.nearlyDue,
      state: "milking",
      calvedAt: new Date("2031-01-25T02:00:00.000Z"),
    });

    // The calving is behind her: nothing is expected, and no work for it waits or comes round again.
    const after = await workFor(
      "2031-01-26T03:00:00.000Z",
      world.prep.definitionId,
      world.nearlyDue
    );
    expect(after.her.expectedCalvingAt).toBeNull();
    expect(after.rows).toHaveLength(0);
    const closed = await manager.client.instances.get({
      id: prep.rows[0]?.id ?? "",
    });
    expect(closed.state).toBe("missed");
  });

  it("moves open work when the farm changes a lead", async () => {
    // Her prep was put on 4 September after her date was corrected. Ten days' lead instead of seven
    // puts it on 1 September; seven again puts it back.
    const clock = new FakeClock("2031-07-05T04:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const her = await manager.client.animals.byTag({
      tagNumber: world.alreadyCarrying,
    });
    const raisedPrep = await scratchDb().query.sopInstance.findFirst({
      where: { definitionId: world.prep.definitionId, animalId: her.id },
      columns: { id: true },
    });
    const prepId = raisedPrep?.id ?? "";
    try {
      await manager.client.farm.setParameters({ calvingPrepLeadDays: 10 });
      const moved = await manager.client.instances.get({ id: prepId });
      expect(moved.dueAt.toISOString()).toBe("2031-08-31T18:00:00.000Z");
    } finally {
      // Every test file shares this farm: the lead goes back whatever happened above.
      await manager.client.farm.setParameters({ calvingPrepLeadDays: 7 });
    }
    const back = await manager.client.instances.get({ id: prepId });
    expect(back.dueAt.toISOString()).toBe("2031-09-03T18:00:00.000Z");
  });
});

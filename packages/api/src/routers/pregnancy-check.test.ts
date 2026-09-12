import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { HEAT } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Pregnancy Check: forty-five days after a heat's first service, the Vet says whether she is
// carrying — and a heat served twice is one attempt, not two.

const suffix = `${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;

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

const serviceStep = (id: string, bn: string) => ({
  id,
  text: { bn },
  repeatPerAnimal: false,
  evidence: [
    {
      type: "choice" as const,
      required: true,
      choices: [
        { value: "ai", label: { bn: "কৃত্রিম প্রজনন" } },
        { value: "natural", label: { bn: "ষাঁড় দিয়ে" } },
      ],
    },
    { type: "note" as const, required: true },
    { type: "note" as const, required: false },
    { type: "datetime" as const, required: true },
  ],
  // "Once was enough" is worth writing down: the second service is not always given.
  skipReasons: [{ bn: "একবারেই যথেষ্ট" }],
  effect: { kind: "service" as const },
});

/** Served once at twelve hours, and sometimes again at twenty-four (Owner, 2026-09-13). */
const aiSop = (): SopContent => ({
  name: { bn: `পাল দেওয়া ${suffix}`, en: "Service" },
  purpose: { bn: "গরম হওয়া গাভীকে সময়মতো পাল দেওয়া" },
  triggers: [{ kind: "event", event: "heat" }],
  appliesTo: { side: "dairy" },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 60,
  steps: [
    serviceStep("first", "প্রথমবার পাল দিন"),
    serviceStep("second", "দরকার হলে দ্বিতীয়বার"),
  ],
});

/** The Vet's check, raised by a service — once per heat served, however many times. */
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

const setup = async () => {
  const clock = new FakeClock("2028-01-01T00:00:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const shed = await owner.client.herd.createShed({ name: `pd-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `গর্ভ ${suffix}`,
  });
  const cows = [];
  for (let index = 0; index < 4; index += 1) {
    cows.push(
      // oxlint-disable-next-line no-await-in-loop
      await owner.client.animals.register({
        sex: "female",
        side: "dairy",
        state: "heifer",
        penId: pen.id,
        source: "born",
        aliases: [],
      })
    );
  }
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-pd-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();
  const watch = await owner.client.sops.create({ content: heatWatchSop() });
  const ai = await owner.client.sops.create({ content: aiSop() });
  const check = await owner.client.sops.create({ content: checkSop() });
  return { owner, pen, cows, watch, ai, check };
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
    world.check.definitionId,
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
    .where(eq(penAssignment.id, `pa-pd-${world.pen.id}`));
});

const tagOf = (index: number) => world.cows[index]?.tagNumber ?? "";

/** Every open piece of one procedure's work about one cow, today's and any still waiting. */
const workFor = async (
  at: string,
  definitionId: string,
  tagNumber: string,
  as: "manager" | "vet" = "manager"
) => {
  const clock = new FakeClock(at);
  const client = await createTestClient(appRouter, { as, clock });
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  await manager.client.instances.ensureDue();
  const her = await manager.client.animals.byTag({ tagNumber });
  const today = await manager.client.instances.today({ penId: world.pen.id });
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
  return { rows, client, her };
};

/** She is seen in heat and served — once, or twice — on the AI work her heat raised. */
const heatAndServe = async (
  day: string,
  tagNumber: string,
  servedAt: string[]
): Promise<string> => {
  const clock = new FakeClock(`${day}T00:00:00.000Z`);
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  await manager.client.instances.raiseNow({
    definitionId: world.watch.definitionId,
    penId: world.pen.id,
  });
  const rounds = await manager.client.instances.today({ penId: world.pen.id });
  const round = rounds.find(
    (row) =>
      row.definitionId === world.watch.definitionId && row.state !== "completed"
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
  const { rows } = await workFor(
    later.now().toISOString(),
    world.ai.definitionId,
    tagNumber
  );
  const workId = rows[0]?.id ?? "";
  const serving = await createTestClient(appRouter, {
    as: "manager",
    clock: later,
  });
  await serving.client.instances.claim({ id: workId });
  await serving.client.instances.completeStep({
    instanceId: workId,
    stepId: "first",
    evidence: ["ai", "HF-2231-BD", "রহিম", servedAt[0] ?? ""],
  });
  await (servedAt[1]
    ? serving.client.instances.completeStep({
        instanceId: workId,
        stepId: "second",
        evidence: ["ai", "HF-2231-BD", "রহিম", servedAt[1]],
      })
    : serving.client.instances.completeStep({
        instanceId: workId,
        stepId: "second",
        evidence: [],
        skipReason: "একবারেই যথেষ্ট",
      }));
  await serving.client.instances.complete({ id: workId });
  return workId;
};

describe("the pregnancy check", () => {
  it("raises one check for a heat served twice, due from the first service", async () => {
    // Served at 12:00 and again at 20:00 on 2 January — one heat, one attempt.
    await heatAndServe("2028-01-02", tagOf(0), [
      "2028-01-02T12:00:00.000Z",
      "2028-01-02T20:00:00.000Z",
    ]);

    const her = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2028-01-03T00:00:00.000Z"),
    });
    const record = await her.client.animals.byTag({ tagNumber: tagOf(0) });
    // Both services are kept.
    expect(record.services).toHaveLength(2);

    // Forty-five days after the first service is 16 February. Looked for on the 18th, when a check
    // raised by the second service — served on the farm's next day — would be late as well: one
    // check, not two.
    const { rows } = await workFor(
      "2028-02-18T03:00:00.000Z",
      world.check.definitionId,
      tagOf(0)
    );
    expect(rows).toHaveLength(1);
    // Due on the farm's day forty-five days on — midnight in Dhaka is 18:00 the day before.
    expect(rows[0]?.dueAt.toISOString()).toBe("2028-02-15T18:00:00.000Z");
  });

  it("sets Expected Calving and makes a heifer a Pregnant Heifer when she is carrying", async () => {
    const { rows, client } = await workFor(
      "2028-02-18T04:00:00.000Z",
      world.check.definitionId,
      tagOf(0),
      "vet"
    );
    const workId = rows[0]?.id ?? "";
    await client.client.instances.claim({ id: workId });
    await client.client.instances.completeStep({
      instanceId: workId,
      stepId: "check",
      evidence: ["positive"],
    });

    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2028-02-18T05:00:00.000Z"),
    });
    const her = await manager.client.animals.byTag({ tagNumber: tagOf(0) });
    expect(her.state).toBe("pregnant_heifer");
    // Worked out from the first service, never typed: 12:00 on 2 January plus 283 days.
    const expected = new Date(
      new Date("2028-01-02T12:00:00.000Z").getTime() + 283 * DAY
    );
    expect(her.expectedCalvingAt?.toISOString()).toBe(expected.toISOString());
    expect(her.pregnancyChecks[0]).toMatchObject({ result: "positive" });
  });

  it("counts a negative check as a failed attempt and leaves her to heat watch", async () => {
    await heatAndServe("2028-01-05", tagOf(1), ["2028-01-05T12:00:00.000Z"]);
    const { rows, client } = await workFor(
      "2028-02-19T04:00:00.000Z",
      world.check.definitionId,
      tagOf(1),
      "vet"
    );
    const workId = rows[0]?.id ?? "";
    await client.client.instances.claim({ id: workId });
    await client.client.instances.completeStep({
      instanceId: workId,
      stepId: "check",
      evidence: ["negative"],
    });

    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2028-02-19T05:00:00.000Z"),
    });
    const her = await manager.client.animals.byTag({ tagNumber: tagOf(1) });
    // Nothing she has is taken away: she is still a heifer, with no calving to expect.
    expect(her.state).toBe("heifer");
    expect(her.expectedCalvingAt).toBeNull();
    expect(her.failedAttempts).toBe(1);
  });

  it("moves the check when the day she was served is put right", async () => {
    // Written up as the 11th, and the check it raises is due on the farm's 25 February.
    const workId = await heatAndServe("2028-01-11", tagOf(3), [
      "2028-01-11T12:00:00.000Z",
    ]);
    const nextDay = "2028-01-12T03:00:00.000Z";
    const before = await workFor(nextDay, world.check.definitionId, tagOf(3));
    expect(before.rows).toHaveLength(0);

    // She was served on the 10th. The check counts from the day as it now stands.
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(nextDay),
    });
    const board = await manager.client.instances.get({ id: workId });
    const entry = board.completions.find((row) => row.stepId === "first");
    await manager.client.instances.correctStep({
      completionId: entry?.id ?? "",
      evidence: ["ai", "HF-2231-BD", "রহিম", "2028-01-10T12:00:00.000Z"],
      reason: "তারিখ ভুল লেখা হয়েছিল",
    });

    const { rows } = await workFor(
      "2028-02-26T03:00:00.000Z",
      world.check.definitionId,
      tagOf(3)
    );
    // One check, on the corrected day — the one raised on the wrong day went with it.
    expect(rows.map((row) => row.dueAt.toISOString())).toEqual([
      "2028-02-23T18:00:00.000Z",
    ]);
  });

  it("is the Vet's alone to record", async () => {
    await heatAndServe("2028-01-08", tagOf(2), ["2028-01-08T12:00:00.000Z"]);
    const at = "2028-02-22T04:00:00.000Z";
    const { rows } = await workFor(at, world.check.definitionId, tagOf(2));
    const workId = rows[0]?.id ?? "";
    const clock = new FakeClock(at);

    // The Manager and the Owner may step into any shift, and the matrix still gives the Pregnancy
    // Check to the Vet: whether a cow is carrying is a clinical finding, not a farm decision.
    for (const as of ["manager", "owner"] as const) {
      // Sequential: each refusal is read before the next person tries.
      // oxlint-disable-next-line no-await-in-loop
      const other = await createTestClient(appRouter, { as, clock });
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        other.client.instances.completeStep({
          instanceId: workId,
          stepId: "check",
          evidence: ["positive"],
        })
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        data: { refusal: "vet_only" },
      });
    }
    // And a milker is refused at the Step: the work is the Vet's.
    const milker = await createTestClient(appRouter, { as: "staff", clock });
    await expect(
      milker.client.instances.completeStep({
        instanceId: workId,
        stepId: "check",
        evidence: ["positive"],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

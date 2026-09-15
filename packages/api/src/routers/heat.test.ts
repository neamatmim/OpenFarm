import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { HEAT } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

// A Heat, and the window it opens: somebody on the round sees a cow bulling, and the farm raises
// the AI work for her in the hours a service takes.

const suffix = `${Date.now()}`;

/** The heat-watch round. No trigger of its own: this file raises it by hand in its own Pen,
 *  because a scheduled round would be raised in every dairy Pen the shared farm holds. */
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
            // The farm's own word for oestrus: this is what makes an Observation a Heat.
            { value: HEAT, label: { bn: "গরম হয়েছে" } },
          ],
        },
      ],
      skipReasons: [{ bn: "পাওয়া যায়নি" }],
      effect: { kind: "observation" },
    },
  ],
});

/** The AI work a Heat raises. Its timing is the farm's AI window, not a figure in the Version. */
const aiSop = (): SopContent => ({
  name: { bn: `কৃত্রিম প্রজনন ${suffix}`, en: "AI" },
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
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

const setup = async () => {
  const clock = new FakeClock("2027-09-01T03:00:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const shed = await owner.client.herd.createShed({ name: `heat-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `বকনা ${suffix}`,
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
  // A cow for each question, so no test's heats become another test's history.
  const cows = [];
  for (let index = 0; index < 6; index += 1) {
    // Sequential: Tag Numbers are handed out in order from one counter.
    // oxlint-disable-next-line no-await-in-loop
    cows.push(await heifer());
  }

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-heat-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();

  const watch = await owner.client.sops.create({ content: heatWatchSop() });
  const ai = await owner.client.sops.create({ content: aiSop() });
  return { owner, pen, cows, watch, ai };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** Hands the farm back: both procedures retired, the work they raised shut, and the Pen this
 *  file gave the shared Staff member taken back again. */
afterAll(async () => {
  const { and, eq, inArray } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { sopInstance } = await import("@OpenFarm/db/schema/instance");
  const db = scratchDb();
  const mine = [world.watch.definitionId, world.ai.definitionId];
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
    .where(eq(penAssignment.id, `pa-heat-${world.pen.id}`));
});

const tagOf = (index: number) => world.cows[index]?.tagNumber ?? "";

/** How many rounds this file's own phone has sent. */
let heldSeq = 0;

/** One heat-watch round in this file's Pen, recording what was seen of one cow. `recordedAt` is
 *  the phone's own clock, for a sighting that reaches the farm later than it was made. */
const watchRound = async (
  at: string,
  tagNumber: string,
  saw: string,
  recordedAt?: string
) => {
  const clock = new FakeClock(at);
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  await manager.client.instances.raiseNow({
    definitionId: world.watch.definitionId,
    penId: world.pen.id,
  });
  const today = await manager.client.instances.today({ penId: world.pen.id });
  const round = today.find(
    (candidate) =>
      candidate.definitionId === world.watch.definitionId &&
      candidate.state !== "completed"
  );
  if (!round) {
    throw new Error("expected a heat-watch round");
  }
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  await staff.client.instances.claim({ id: round.id });
  const step = {
    instanceId: round.id,
    stepId: "look",
    animalTag: tagNumber,
    evidence: [saw],
  };
  if (recordedAt) {
    // Held on a phone until it found signal: only a phone's Outbox can say the round was walked earlier than the farm
    // heard of it.
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-heat", name: "গরম দেখার শেড ফোন" },
    });
    heldSeq += 1;
    await phone.client.sync.batch({
      key: `heat-${round.id}`,
      entries: [
        {
          id: `heat-${round.id}`,
          seq: heldSeq,
          kind: "step_completion" as const,
          recordedAt: new Date(recordedAt),
          ...step,
        },
      ],
    });
  } else {
    await staff.client.instances.completeStep(step);
  }
  return { clock, manager, staff, roundId: round.id };
};

/** Serves her: the Manager does the AI work a Heat raised and finishes it. */
const serve = async (at: string, workId: string) => {
  const clock = new FakeClock(at);
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  await manager.client.instances.claim({ id: workId });
  await manager.client.instances.completeStep({
    instanceId: workId,
    stepId: "serve",
    evidence: [true],
  });
  await manager.client.instances.complete({ id: workId });
};

/** Every open piece of AI work about one cow: today's, and anything from an earlier day that is
 *  still waiting — which is where a Heat's work is by the time the next one is seen. */
const aiWorkFor = async (clockAt: string, tagNumber: string) => {
  const clock = new FakeClock(clockAt);
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  await manager.client.instances.ensureDue();
  const her = await manager.client.animals.byTag({ tagNumber });
  const today = await manager.client.instances.today({ penId: world.pen.id });
  const late = await manager.client.instances.overdue();
  const seen = new Set<string>();
  return [...today, ...late].filter((row) => {
    const mine =
      row.definitionId === world.ai.definitionId &&
      row.animalId === her.id &&
      !seen.has(row.id);
    seen.add(row.id);
    return mine;
  });
};

describe("a heat, and the window it opens", () => {
  it("raises the AI work in the hours a service takes", async () => {
    // Seen bulling on the morning round: 06:00 in Dhaka, midnight UTC, on 2 September.
    await watchRound("2027-09-02T00:00:00.000Z", tagOf(0), HEAT);

    const raised = await aiWorkFor("2027-09-02T00:30:00.000Z", tagOf(0));
    expect(raised).toHaveLength(1);
    // Due at the start of the window, twelve hours on — six in the evening in Dhaka — and late
    // once the window has closed, six hours after that.
    const [work] = raised;
    expect(work?.dueAt.toISOString()).toBe("2027-09-02T12:00:00.000Z");
    expect(work?.graceMinutes).toBe(6 * 60);
  });

  it("does not raise a second piece of work while the first is open", async () => {
    // Still bulling on the next morning's round, and nobody has served her yet.
    await watchRound("2027-09-03T00:00:00.000Z", tagOf(0), HEAT);
    const raised = await aiWorkFor("2027-09-03T00:30:00.000Z", tagOf(0));
    expect(raised).toHaveLength(1);
  });

  it("raises nothing for a cow somebody looked at and saw nothing", async () => {
    await watchRound("2027-09-03T00:00:00.000Z", tagOf(1), "nothing");
    const raised = await aiWorkFor("2027-09-03T00:30:00.000Z", tagOf(1));
    expect(raised).toHaveLength(0);
  });

  it("follows the farm's own window when the Manager changes it", async () => {
    const setter = await createTestClient(appRouter, { as: "manager" });
    const before = setter.context.farm;
    await setter.client.farm.setParameters({
      aiWindowStartHours: 10,
      aiWindowEndHours: 20,
    });
    try {
      await watchRound("2027-09-04T00:00:00.000Z", tagOf(1), HEAT);
      const [work] = await aiWorkFor("2027-09-04T00:30:00.000Z", tagOf(1));
      expect(work?.dueAt.toISOString()).toBe("2027-09-04T10:00:00.000Z");
      expect(work?.graceMinutes).toBe(10 * 60);
    } finally {
      // Back to what it was, whatever that was: the Farm is the whole test run's.
      await setter.client.farm.setParameters({
        aiWindowStartHours: before?.aiWindowStartHours ?? 12,
        aiWindowEndHours: before?.aiWindowEndHours ?? 18,
      });
    }
  });

  it("will not publish a heat's work hung days later", async () => {
    // The window is the farm's, in hours. A number of days would be accepted and ignored, which
    // is worse than refused.
    const owner = await createTestClient(appRouter, { as: "owner" });
    const wrong = aiSop();
    await expect(
      owner.client.sops.create({
        content: {
          ...wrong,
          name: { bn: `ভুল ${suffix}` },
          triggers: [{ kind: "event", event: "heat", offsetDays: 1 }],
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("raises nothing more for a heat already served", async () => {
    // Seen on the morning round, served that afternoon, and seen again the next morning — the
    // same heat. There is no open job to hide the second sighting behind, and it must still raise
    // nothing: a technician sent back to a cow he has just served stops trusting the list.
    await watchRound("2027-09-10T00:00:00.000Z", tagOf(2), HEAT);
    const [work] = await aiWorkFor("2027-09-10T00:30:00.000Z", tagOf(2));
    await serve("2027-09-10T12:30:00.000Z", work?.id ?? "");

    await watchRound("2027-09-11T00:00:00.000Z", tagOf(2), HEAT);
    const afterwards = await aiWorkFor("2027-09-11T00:30:00.000Z", tagOf(2));
    expect(afterwards).toHaveLength(0);

    // Three weeks later she is back in heat — the service did not take — and that is a new heat.
    await watchRound("2027-10-01T00:00:00.000Z", tagOf(2), HEAT);
    const again = await aiWorkFor("2027-10-01T00:30:00.000Z", tagOf(2));
    expect(again).toHaveLength(1);
  });

  it("raises one job for two sightings that reach the farm together", async () => {
    // A shed phone with no signal for two days carries two sightings of one heat, and the farm
    // hears both on one app-open. One heat, one job.
    await watchRound("2027-09-12T00:00:00.000Z", tagOf(3), HEAT);
    await watchRound("2027-09-13T00:00:00.000Z", tagOf(3), HEAT);
    const raised = await aiWorkFor("2027-09-13T00:30:00.000Z", tagOf(3));
    expect(raised).toHaveLength(1);
  });

  it("takes the work back when the heat is corrected away", async () => {
    await watchRound("2027-09-14T00:00:00.000Z", tagOf(4), HEAT);
    const [work] = await aiWorkFor("2027-09-14T00:30:00.000Z", tagOf(4));
    expect(work).toBeDefined();

    // The milker had the wrong cow. Put right, her AI work goes with the heat that raised it,
    // rather than sending somebody to serve a cow who was not in heat.
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2027-09-14T01:00:00.000Z"),
    });
    const her = await manager.client.animals.byTag({ tagNumber: tagOf(4) });
    const rounds = await manager.client.instances.today({
      penId: world.pen.id,
    });
    const round = rounds.find(
      (row) => row.definitionId === world.watch.definitionId
    );
    const board = await manager.client.instances.get({ id: round?.id ?? "" });
    const entry = board.completions.find(
      (row) => row.stepId === "look" && row.animalId === her.id
    );
    await correctStepAsShown(manager.client, {
      completionId: entry?.id ?? "",
      evidence: ["nothing"],
      reason: "ভুল গাভী লেখা হয়েছিল",
    });

    const left = await aiWorkFor("2027-09-14T01:30:00.000Z", tagOf(4));
    expect(left).toHaveLength(0);
  });

  it("asks the Manager about a heat that reached the farm after its window", async () => {
    // Seen at dawn on the 16th, but the phone had no signal until that night: by the time the farm
    // hears of it, the window closed at midnight. The job is still raised — the heat is never
    // dropped — and the Manager is told the window went by for want of signal.
    await watchRound(
      "2027-09-16T19:00:00.000Z",
      tagOf(5),
      HEAT,
      "2027-09-16T00:00:00.000Z"
    );
    const raised = await aiWorkFor("2027-09-16T19:30:00.000Z", tagOf(5));
    expect(raised).toHaveLength(1);

    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2027-09-16T19:30:00.000Z"),
    });
    const queue = await manager.client.review.open();
    const asked = queue.find(
      (row) => row.reason === "late_entry" && row.entityId === raised[0]?.id
    );
    expect(asked).toBeDefined();
    // Answered, because the queue is the whole Farm's and this file shares it.
    await manager.client.review.resolve({
      id: asked?.id ?? "",
      resolution: "পরের গরমে প্রজনন করা হবে",
    });
  });

  it("shows her Heats on her page", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2027-09-05T09:00:00.000Z"),
    });
    const her = await manager.client.animals.byTag({ tagNumber: tagOf(0) });
    expect(her.heats).toHaveLength(2);
    // Newest first. The second sighting was of a heat already begun, so it raised nothing and
    // points to nothing; the first raised her AI work and links to it.
    expect(her.heats[0]?.workId).toBeNull();
    expect(her.heats[1]?.workId).not.toBeNull();
  });
});

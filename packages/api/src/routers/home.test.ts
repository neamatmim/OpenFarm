import { eq } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const suffix = `${Date.now()}`;

/** Twice a day, one Step for the Pen, checked by the Manager. */
const roundSop = (): SopContent => ({
  name: { bn: `চক্কর ${suffix}`, en: "Round" },
  purpose: { bn: "পেন ঘুরে দেখুন" },
  triggers: [{ kind: "schedule", times: ["05:00", "16:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 30,
  steps: [
    {
      id: "look",
      text: { bn: "পেন দেখুন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({ name: `home-${suffix}` });
  const worked = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "কাজের পেন",
  });
  const untouched = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "ছোঁয়া হয়নি এমন পেন",
  });
  await Promise.all(
    [worked, untouched].map((pen) =>
      owner.client.animals.register({
        sex: "female",
        side: "dairy",
        state: "heifer",
        penId: pen.id,
        source: "born",
        aliases: [],
      })
    )
  );
  const sop = await owner.client.sops.create({ content: roundSop() });
  return { owner, worked, untouched, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

describe("the screen the Manager runs the day from", () => {
  it("shows what needs them, and how the day is going pen by pen", async () => {
    // Half past nine in the morning, farm time: the five o'clock round is long overdue.
    const clock = new FakeClock("2028-01-05T03:30:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await manager.client.instances.ensureDue();

    const home = await manager.client.home.manager();

    const mine = home.pens.filter((pen) =>
      [world.worked.id, world.untouched.id].includes(pen.penId)
    );
    expect(mine).toHaveLength(2);
    // Two sessions of this round in each Pen, and nothing done in either. Counted with "at least", because a Pen's
    // day is every SOP that concerns it, and this file authors more than one.
    expect(mine.every((pen) => pen.done === 0 && pen.raised >= 2)).toBe(true);
    // And the morning round is late in both. Asked of the day's work rather than of the
    // Manager's queue: the queue shows the farm's fifty most overdue pieces of work, so on a
    // farm — or a test database — carrying an older backlog, this Pen's round is late whether
    // or not it makes that list.
    const lateIn = async (penId: string) => {
      const work = await manager.client.instances.today({ penId });
      return work.some(
        (row) => row.definitionId === world.sop.definitionId && row.overdue
      );
    };
    expect(await lateIn(world.worked.id)).toBe(true);
    expect(await lateIn(world.untouched.id)).toBe(true);
  });

  it("counts a Pen nobody has touched as raised and not done, rather than leaving it out", async () => {
    const clock = new FakeClock("2028-01-06T03:30:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    await manager.client.instances.ensureDue();

    // The morning round is done in one Pen and not in the other.
    const today = await manager.client.instances.today({
      penId: world.worked.id,
    });
    const morning = today.find(
      (row) => row.definitionId === world.sop.definitionId
    );
    if (!morning) {
      throw new Error("expected the morning round");
    }
    await manager.client.instances.claim({ id: morning.id });
    await manager.client.instances.completeStep({
      instanceId: morning.id,
      stepId: "look",
      evidence: [true],
    });
    await manager.client.instances.complete({ id: morning.id });

    const home = await manager.client.home.manager();
    const worked = home.pens.find((pen) => pen.penId === world.worked.id);
    const untouched = home.pens.find((pen) => pen.penId === world.untouched.id);

    expect(worked?.done).toBe(1);
    expect(worked?.raised).toBeGreaterThanOrEqual(2);
    // The Pen nobody has been to is on the screen saying so — a Pen that vanishes from the
    // list is a Pen nobody remembers to ask about.
    expect(untouched?.done).toBe(0);
    expect(untouched?.raised).toBeGreaterThanOrEqual(2);
    expect(untouched?.animals).toBeGreaterThanOrEqual(1);

    // And the work that was finished is waiting for the Manager to sign it off.
    expect(home.queue.signOff.map((row) => row.id)).toContain(morning.id);
    expect(staff).toBeDefined();
  });

  it("says nothing is waiting when nothing is", async () => {
    // A farm at two in the morning: the day's work has not been raised yet.
    const clock = new FakeClock("2028-01-07T20:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    const home = await manager.client.home.manager();
    const mine = home.pens.filter((pen) =>
      [world.worked.id, world.untouched.id].includes(pen.penId)
    );

    expect(mine).toEqual([]);
  });

  it("will not show the farm's queue to a Staff member", async () => {
    const staff = await createTestClient(appRouter, { as: "staff" });
    await expect(staff.client.home.manager()).rejects.toThrow();
  });

  it("keeps a Pen that was settled as Missed out of what is still outstanding", async () => {
    const clock = new FakeClock("2028-01-08T03:30:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await manager.client.instances.ensureDue();
    const today = await manager.client.instances.today({
      penId: world.untouched.id,
    });
    const morning = today.find(
      (row) => row.definitionId === world.sop.definitionId
    );
    if (!morning) {
      throw new Error("expected the morning round");
    }

    await manager.client.instances.closeAsMissed({
      id: morning.id,
      reason: "কেউ ছিল না",
    });

    const home = await manager.client.home.manager();
    const pen = home.pens.find((row) => row.penId === world.untouched.id);
    // Settled, not outstanding: the Manager decided this one, and a screen that keeps
    // showing it is telling them about a decision they have already made.
    expect(pen?.missed).toBe(1);
    expect(home.queue.overdue.map((row) => row.id)).not.toContain(morning.id);
  });

  it("puts the cow whose withdrawal ends soonest at the top, and says when", async () => {
    const clock = new FakeClock("2028-01-09T03:30:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const cow = await manager.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.worked.id,
      source: "born",
      aliases: [],
    });
    // Treated, and off withdrawal tomorrow morning. Health sets this from a Treatment in
    // increment 3; until then it is set directly, which is what that column is for.
    await scratchDb()
      .update(animal)
      .set({
        milkWithdrawalUntil: new Date(clock.now().getTime() + 20 * 60 * 60_000),
      })
      .where(eq(animal.tagNumber, cow.tagNumber));

    const home = await manager.client.home.manager();
    const hers = home.queue.withdrawal.find(
      (row) => row.tagNumber === cow.tagNumber
    );

    expect(hers?.endingSoon).toBe(true);
    expect(hers?.until).toBeInstanceOf(Date);
  });
});

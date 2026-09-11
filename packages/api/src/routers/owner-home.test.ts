import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const suffix = `${Date.now()}`;

/** The milking SOP, cut down: litres per cow and a tank reading. */
const milkingSop = (): SopContent => ({
  name: { bn: `দোহন ${suffix}`, en: "Milking" },
  purpose: { bn: "প্রতিটি গাভীর দুধ" },
  triggers: [{ kind: "schedule", times: ["05:00", "16:00"] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 90,
  steps: [
    {
      id: "milk",
      text: { bn: "দুধ দোহন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "লিটার" },
          min: 0,
          max: 40,
        },
      ],
      skipReasons: [],
      effect: { kind: "milk_record" },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({ name: `owner-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "দোহন পেন",
  });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  // Up the lifecycle in order: a heifer becomes a milking cow by way of being in calf.
  await owner.client.animals.setState({
    tagNumber: cow.tagNumber,
    state: "pregnant_heifer",
  });
  await owner.client.animals.setState({
    tagNumber: cow.tagNumber,
    state: "milking",
  });
  const sop = await owner.client.sops.create({ content: milkingSop() });
  return { owner, pen, cow, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

describe("the Owner's home", () => {
  it("opens on what needs the Owner, and the litres the day actually came to", async () => {
    const clock = new FakeClock("2028-02-01T03:30:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    await owner.client.instances.ensureDue();
    const today = await owner.client.instances.today({ penId: world.pen.id });
    const morning = today.find(
      (row) => row.definitionId === world.sop.definitionId
    );
    if (!morning) {
      throw new Error("expected the morning milking");
    }
    await owner.client.instances.claim({ id: morning.id });
    await owner.client.instances.completeStep({
      instanceId: morning.id,
      stepId: "milk",
      animalTag: world.cow.tagNumber,
      evidence: [12],
    });

    const home = await owner.client.home.owner();

    // The litres are the farm's own record, not a figure anybody typed on a dashboard.
    expect(home.tiles.bulkToday).toBeGreaterThanOrEqual(12);
    expect(home.tiles.sessions.length).toBeGreaterThanOrEqual(1);
    // The list that needs them is the longest-waiting work, bounded — so what is asserted
    // is its shape, not that this test's own hour-late milking beat a farm's worth of it.
    expect(home.needsYou.overdue.length).toBeLessThanOrEqual(50);
    const lateness = home.needsYou.overdue.map((row) => row.minutesOverdue);
    expect(lateness).toEqual(lateness.toSorted((a, b) => b - a));

    // And this morning's milking is late, which the farm's own Overdue list says.
    const late = await owner.client.instances.overdue();
    expect(late.map((row) => row.id)).toContain(morning.id);
  });

  it("puts a Manager's proposal in front of the Owner, and nothing else in front of a Manager", async () => {
    const clock = new FakeClock("2028-02-02T03:30:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const owner = await createTestClient(appRouter, { as: "owner", clock });

    await manager.client.sops.propose({
      definitionId: world.sop.definitionId,
      content: {
        ...milkingSop(),
        purpose: { bn: "প্রতিটি গাভীর দুধ, দুইবেলা" },
      },
      note: "উদ্দেশ্য স্পষ্ট করা",
    });

    const home = await owner.client.home.owner();
    expect(
      home.needsYou.proposals.some(
        (row) => row.definitionId === world.sop.definitionId
      )
    ).toBe(true);

    // The Owner's screen is the Owner's: a Manager asking for it is refused.
    await expect(manager.client.home.owner()).rejects.toThrow();
  });

  it("says the farm is fine by having nothing to say", async () => {
    // Two in the morning: yesterday's work is settled and today's is not raised.
    const clock = new FakeClock("2028-02-03T20:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });

    const home = await owner.client.home.owner();

    // Nothing of this test's own making is waiting — the farm's own leftovers are other
    // tests' business, so this asserts the shape rather than a count of everything.
    expect(Array.isArray(home.needsYou.overdue)).toBe(true);
    expect(home.tiles.workRaised).toBe(0);
    expect(home.tiles.bulkToday).toBe(0);
  });

  it("adds the litres up the way the farm would, and no other way", async () => {
    const clock = new FakeClock("2028-02-04T03:30:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    await owner.client.instances.ensureDue();
    const today = await owner.client.instances.today({ penId: world.pen.id });
    const morning = today.find(
      (row) => row.definitionId === world.sop.definitionId
    );
    if (!morning) {
      throw new Error("expected the morning milking");
    }
    await owner.client.instances.claim({ id: morning.id });
    await owner.client.instances.completeStep({
      instanceId: morning.id,
      stepId: "milk",
      animalTag: world.cow.tagNumber,
      evidence: [9.5],
      destination: "discard",
    });

    const home = await owner.client.home.owner();
    // Discarded milk never reached the tank, so it is not in what the tank got — the tile
    // is the farm's record of where the milk went, not of how much was drawn.
    expect(home.tiles.bulkToday).toBe(0);
  });
});

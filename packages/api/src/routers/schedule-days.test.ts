import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Not every job is daily: the fattening side is weighed every other Saturday, the store counted every Friday.

const suffix = `${Date.now()}`;

const weighing = (): SopContent => ({
  name: { bn: `পাক্ষিক ওজন ${suffix}`, en: "Fortnightly weigh-in" },
  purpose: { bn: "প্রতি দুই সপ্তাহে ওজন" },
  triggers: [
    { kind: "schedule", times: ["08:00"], weekdays: [6], everyOtherWeek: true },
  ],
  appliesTo: { side: "fattening", states: ["fattening"] },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 240,
  steps: [
    {
      id: "look",
      text: { bn: "ওজন নিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

let world: { penId: string; definitionId: string };
beforeAll(async () => {
  const { client: owner } = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.herd.createShed({ name: `weekdays-${suffix}` });
  const pen = await owner.herd.createPen({
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  const bull = await owner.animals.register({
    sex: "male",
    side: "fattening",
    state: "quarantine",
    penId: pen.id,
    source: "bought",
    aliases: [],
  });
  await owner.animals.setState({
    tagNumber: bull.tagNumber,
    state: "fattening",
  });
  const sop = await owner.sops.create({ content: weighing() });
  world = { penId: pen.id, definitionId: sop.definitionId };
});

/** Whether the work is on the Pen's list for a farm day, once the day's work has been raised. */
const raisedOn = async (day: string) => {
  const clock = new FakeClock(`${day}T01:00:00.000Z`);
  const { client: manager } = await createTestClient(appRouter, {
    as: "manager",
    clock,
  });
  await manager.instances.ensureDue();
  const today = await manager.instances.today({ penId: world.penId });
  return today.some((row) => row.definitionId === world.definitionId);
};

describe("a schedule kept on some days of the week", () => {
  it("raises the work on its day, every other week, and not in between", async () => {
    expect(await raisedOn("2034-06-03")).toBe(true);
    expect(await raisedOn("2034-06-05")).toBe(false);
    expect(await raisedOn("2034-06-10")).toBe(false);
    expect(await raisedOn("2034-06-17")).toBe(true);
  });

  it("refuses every other week with no day to fall on", async () => {
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
    });
    const content = weighing();
    content.name = { bn: `ভুল সূচি ${suffix}` };
    content.triggers = [
      { kind: "schedule", times: ["08:00"], everyOtherWeek: true },
    ];
    await expect(owner.sops.create({ content })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
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
  const shed = await owner.sheds.create({ name: `weekdays-${suffix}` });
  const pen = await owner.sheds.pens.create({
    quarantine: true,
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
  await manager.work.ensureDue();
  const today = await manager.work.today({ penId: world.penId });
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

describe("a schedule moved by a new Version during the day", () => {
  const twiceADay = (times: string[]): SopContent => ({
    ...weighing(),
    name: { bn: `দিনে দুবার ${suffix}`, en: "Twice a day" },
    triggers: [{ kind: "schedule", times }],
  });

  it("keeps the day's work raised under the old one, and raises only what is still to come under the new", async () => {
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2066-03-01T00:00:00.000Z"),
    });
    const sop = await owner.sops.create({
      content: twiceADay(["05:00", "16:00"]),
    });
    // The day's work raised at nine in the morning, the farm's clock: the morning one and the afternoon one.
    const morning = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2066-03-02T03:00:00.000Z"),
    });
    await morning.client.work.ensureDue();
    // At ten the Owner moves both half an hour later.
    const publishing = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2066-03-02T04:00:00.000Z"),
    });
    await publishing.client.sops.publish({
      definitionId: sop.definitionId,
      content: twiceADay(["05:30", "16:30"]),
      note: "দোহনের সময় আধা ঘণ্টা পিছিয়ে",
    });
    const later = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2066-03-02T04:30:00.000Z"),
    });
    await later.client.work.ensureDue();
    const day = await scratchDb().query.sopInstance.findMany({
      where: {
        definitionId: sop.definitionId,
        state: { ne: "called_off" },
        dueAt: {
          gte: new Date("2066-03-01T18:00:00.000Z"),
          lt: new Date("2066-03-02T18:00:00.000Z"),
        },
      },
      columns: { dueAt: true },
      orderBy: { dueAt: "asc" },
    });
    // The morning's, done or not, under the old times; the afternoon's under the new. Not four, and not a 05:30 that
    // was overdue the moment it was raised.
    expect(day.map((one) => one.dueAt.toISOString())).toEqual([
      "2066-03-01T23:00:00.000Z",
      "2066-03-02T10:30:00.000Z",
    ]);
  });
});

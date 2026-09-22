import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { appRouter } from "./routers/index";
import { runTheSchedule, scheduleStatus } from "./scheduler";
import { createTestClient } from "./test/client";

const suffix = `${Date.now()}`;

const roundSop = (): SopContent => ({
  name: { bn: `সকালের পরিদর্শন ${suffix}`, en: "Morning round" },
  purpose: { bn: "প্রতিদিন সকালে দেখা" },
  triggers: [{ kind: "schedule", times: ["05:00"] }],
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 60,
  steps: [
    {
      id: "look",
      text: { bn: "দেখুন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

describe("the farm's schedule, on the server", () => {
  it("raises the day's work with nobody opening the app, and says when it last ran", async () => {
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
    });
    const shed = await owner.herd.createShed({ name: `schedule-${suffix}` });
    const pen = await owner.herd.createPen({
      shedId: shed.id,
      name: `পেন ${suffix}`,
    });
    await owner.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    const sop = await owner.sops.create({ content: roundSop() });

    // Six in the morning in Dhaka, on this farm's own day.
    const clock = new FakeClock("2027-05-10T00:00:00.000Z");
    const ran = await runTheSchedule({
      db: scratchDb(),
      clock,
      farmId: theFarm().id,
    });

    expect(ran.ok).toBe(true);
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock,
    });
    const today = await manager.instances.today({ penId: pen.id });
    expect(today.some((row) => row.definitionId === sop.definitionId)).toBe(
      true
    );
    const status = await scheduleStatus(scratchDb());
    expect(status.lastRanAt?.toISOString()).toBe(clock.now().toISOString());
  });
});

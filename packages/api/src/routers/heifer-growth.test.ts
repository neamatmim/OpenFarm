import type { SopContent } from "@OpenFarm/domain";
import { DAY, FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A heifer served light calves hard and milks little; one fed too well is fat and slow to settle. DLS asks for her weight
 * "monitored regularly" toward 250 kg by eighteen months, and the farm reads each heifer's gain against it. Figures
 * worked by hand: weighed at 300 and 360 days old, 188 days short of 548.
 */
const suffix = `heifer-growth-${Date.now()}`;
const FIRST = new Date("2088-03-01T03:00:00.000Z");
const SECOND = new Date(FIRST.getTime() + 60 * DAY);
const BORN = new Date(FIRST.getTime() - 300 * DAY);

const as = (role: "owner" | "manager", at: Date) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(at) });

/** The round that puts a heifer on the scale, and nothing else — every morning, so the test need not wait a month. */
const heiferWeighing = (): SopContent => ({
  name: { bn: `বকনার ওজন ${suffix}` },
  purpose: { bn: "প্রতিটি বকনার ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo: { side: "dairy", states: ["heifer"] },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 240,
  steps: [
    {
      id: "weigh",
      text: { bn: "ওজন নিন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "কেজি" },
          min: 20,
          max: 700,
        },
      ],
      skipReasons: [{ bn: "পাওয়া যায়নি" }],
      effect: { kind: "weigh_in" },
    },
  ],
});

const weigh = async (
  at: Date,
  penId: string,
  definitionId: string,
  readings: (readonly [string, number])[]
) => {
  const manager = await as("manager", at);
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today({ penId });
  const work = today.find((row) => row.definitionId === definitionId);
  if (!work) {
    throw new Error("expected the heifers' weighing to be due");
  }
  await manager.client.work.claim({ id: work.id });
  for (const [tagNumber, kg] of readings) {
    // oxlint-disable-next-line no-await-in-loop -- one heifer at a time, as a round is walked
    await manager.client.work.completeStep({
      instanceId: work.id,
      stepId: "weigh",
      animalTag: tagNumber,
      evidence: [kg],
    });
  }
};

describe("each heifer's growth toward her first service", () => {
  it("names the heifer whose gain will leave her short of 250 kg at eighteen months", async () => {
    const owner = await as("owner", FIRST);
    const shed = await owner.client.sheds.create({ name: suffix });
    const pen = await owner.client.sheds.pens.create({
      shedId: shed.id,
      name: `বকনা ${suffix}`,
    });
    const heifer = async () => {
      const registered = await owner.client.animals.register({
        sex: "female",
        side: "dairy",
        state: "heifer",
        penId: pen.id,
        source: "born",
        birthDate: BORN,
        aliases: [],
      });
      return registered.tagNumber;
    };
    const slow = await heifer();
    const thriving = await heifer();
    const weighing = await owner.client.sops.create({
      content: heiferWeighing(),
    });

    await weigh(FIRST, pen.id, weighing.definitionId, [
      [slow, 150],
      [thriving, 150],
    ]);
    await weigh(SECOND, pen.id, weighing.definitionId, [
      [slow, 174],
      [thriving, 186],
    ]);

    const later = await as("owner", new Date(SECOND.getTime() + DAY));
    const heifers = await later.client.breeding.heifers();
    // Behind first: 174 + 0.4 × 188 is 249; 186 + 0.6 × 188 is 299.
    expect(heifers).toMatchObject([
      {
        tagNumber: slow,
        growth: { gainPerDay: 0.4, atServiceAgeKg: 249, behind: true },
      },
      {
        tagNumber: thriving,
        growth: { gainPerDay: 0.6, atServiceAgeKg: 299, behind: false },
      },
    ]);
  });
});

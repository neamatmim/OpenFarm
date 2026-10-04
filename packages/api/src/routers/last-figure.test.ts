import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The sheet shows what each animal gave or weighed the time before, so a slip of the thumb is seen against her own
// figure rather than against a range wide enough to let 55 litres through for 5.5.

const suffix = `last-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const milkingSop = (time: string, name: string): SopContent => ({
  name: { bn: `${name} ${suffix}` },
  purpose: { bn: "প্রতিটি গাভীর দুধ" },
  triggers: [{ kind: "schedule", times: [time] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 120,
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

let penId = "";
let cowTag = "";
const sops = { morning: "", evening: "" };

beforeAll(async () => {
  const owner = await as("owner", "2098-01-01T00:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `দোহন ${suffix}`,
  });
  penId = pen.id;
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId,
    source: "born",
    aliases: [],
  });
  cowTag = cow.tagNumber;
  await owner.client.animals.setState({
    tagNumber: cowTag,
    state: "pregnant_heifer",
  });
  await owner.client.animals.setState({ tagNumber: cowTag, state: "milking" });
  const morning = await owner.client.sops.create({
    content: milkingSop("05:00", "সকাল"),
  });
  const evening = await owner.client.sops.create({
    content: milkingSop("16:00", "বিকেল"),
  });
  sops.morning = morning.definitionId;
  sops.evening = evening.definitionId;
});

/** One milking of the cow, at the instant given, of the procedure given; the work it was. */
const milk = async (instant: string, definitionId: string, litres?: number) => {
  const manager = await as("manager", instant);
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today({ penId });
  const work = today.find((row) => row.definitionId === definitionId);
  if (!work) {
    throw new Error("expected the milking");
  }
  await manager.client.work.claim({ id: work.id });
  if (litres !== undefined) {
    await manager.client.work.completeStep({
      instanceId: work.id,
      stepId: "milk",
      animalTag: cowTag,
      evidence: [litres],
    });
  }
  return { manager, id: work.id };
};

describe("her last figure, beside the box", () => {
  it("is what she gave at the same milking the time before, not at the other one", async () => {
    // Six litres on the first morning, four that evening; the next morning's sheet says six.
    await milk("2098-01-02T00:30:00.000Z", sops.morning, 6);
    await milk("2098-01-02T10:30:00.000Z", sops.evening, 4);
    const { manager, id } = await milk(
      "2098-01-03T00:30:00.000Z",
      sops.morning
    );

    const work = await manager.client.work.get({ id });
    expect(work.animals.find((one) => one.tagNumber === cowTag)?.last).toEqual({
      figure: 6,
      at: expect.any(Date),
    });
  });

  it("is not what she gave at this very milking, once it is written", async () => {
    const { manager, id } = await milk(
      "2098-01-04T00:30:00.000Z",
      sops.morning,
      7
    );
    const work = await manager.client.work.get({ id });
    // The third morning's own seven is not "the time before"; the second morning gave nothing, so the first's six.
    expect(
      work.animals.find((one) => one.tagNumber === cowTag)?.last?.figure
    ).toBe(6);
  });
});

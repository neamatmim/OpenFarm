import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Somebody leaving the farm: the Owner disables them, and what was theirs to do goes back to everyone — the work pinned to
// them or in their hands, and the Pens they kept. Their Roles stay on paper, to be given back; the rest does not.

const suffix = `leaving-${Date.now()}`;
const MORNING = "2076-02-03T03:30:00.000Z";

const as = (role: "owner" | "manager" | "staff", instant = MORNING) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const morningSop = (): SopContent => ({
  name: { bn: `সকালের কাজ ${suffix}` },
  purpose: { bn: "প্রতিদিন সকালে" },
  triggers: [{ kind: "schedule", times: ["08:00", "09:00"] }],
  appliesTo: { side: "dairy" },
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

let penId = "";
let staffId = "";

beforeAll(async () => {
  const { client: owner } = await as("owner");
  const shed = await owner.sheds.create({ name: suffix });
  const pen = await owner.sheds.pens.create({
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  penId = pen.id;
  await owner.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId,
    source: "born",
    aliases: [],
  });
  await owner.sops.create({ content: morningSop() });
  await as("staff");
  staffId = thePerson("staff").id;
  const { client: manager } = await as("manager");
  await manager.people.assignPens({
    userId: staffId,
    add: [penId],
    remove: [],
  });
});

describe("somebody the Owner disables", () => {
  it("leaves the work pinned to them or in their hands to everyone, and the Pens they kept", async () => {
    const { client: manager } = await as("manager");
    await manager.work.ensureDue();
    const today = await manager.work.today({ penId });
    const [pinned, claimed] = today;
    if (!(pinned && claimed)) {
      throw new Error("expected the morning's two pieces of work");
    }
    await manager.work.assign({ id: pinned.id, userId: staffId });
    const { client: staff } = await as("staff");
    await staff.work.claim({ id: claimed.id });

    const { client: owner } = await as("owner");
    await owner.people.disable({ userId: staffId });

    const work = await scratchDb().query.sopInstance.findMany({
      where: { id: { in: [pinned.id, claimed.id] } },
      columns: { assignedTo: true, claimedBy: true },
    });
    expect(work).toEqual([
      { assignedTo: null, claimedBy: null },
      { assignedTo: null, claimedBy: null },
    ]);
    const pens = await scratchDb().query.penAssignment.findMany({
      where: {
        farmId: theFarm().id,
        userId: staffId,
        endedAt: { isNull: true },
      },
      columns: { penId: true },
    });
    expect(pens).toEqual([]);
  });

  it("has no work pinned to them while they are gone", async () => {
    const { client: manager } = await as("manager");
    const today = await manager.work.today({ penId });
    const [some] = today;
    await expect(
      manager.work.assign({ id: some?.id ?? "", userId: staffId })
    ).rejects.toMatchObject({ data: { refusal: "has_left_the_farm" } });
  });
});

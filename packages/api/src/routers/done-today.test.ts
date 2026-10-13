import { penAssignment } from "@OpenFarm/db/schema/herd";
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

// The milker's list once showed only what was still owed, so a finished morning read like a list that had gone missing.
// What was done today in the Pens they work is now said beside it.

const suffix = `${Date.now()}`;

/** A Pen's cleaning twice a day, at five and five, with an hour of grace. Nobody checks it. */
const cleaning = (): SopContent => ({
  name: { bn: `পরিষ্কার ${suffix}`, en: "Cleaning" },
  purpose: { bn: "পেন পরিষ্কার" },
  triggers: [{ kind: "schedule", times: ["05:00", "17:00"] }],
  appliesTo: { side: "dairy", states: ["heifer"] },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 60,
  steps: [
    {
      id: "clean",
      text: { bn: "পরিষ্কার করুন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

/** Noon on the farm's day, and the next day's. */
const NOON = "2089-03-10T06:00:00.000Z";
const NEXT_NOON = "2089-03-11T06:00:00.000Z";

let mine = "";
let theirs = "";

/** A Pen with a heifer in it, to have cleaning raised for it. */
const aPen = async (
  owner: Awaited<ReturnType<typeof createTestClient>>,
  name: string
) => {
  const shed = await owner.client.sheds.create({ name: `${name}-${suffix}` });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `${name} ${suffix}`,
  });
  await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  return pen.id;
};

beforeAll(async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  mine = await aPen(owner, "mine");
  theirs = await aPen(owner, "theirs");
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-done-${mine}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: mine,
    })
    .onConflictDoNothing();
  await owner.client.sops.create({ content: cleaning() });
});

/** Raises the day at `at` and finishes the morning's cleaning in `penId`, as whoever `as` is. */
const cleanTheMorning = async (
  penId: string,
  as: "staff" | "owner",
  at = NOON
) => {
  const doing = await createTestClient(appRouter, {
    as,
    clock: new FakeClock(at),
  });
  await doing.client.work.ensureDue();
  const owed = await doing.client.work.today({ penId });
  const morning = owed.find(
    (one) => (one.version.content as SopContent).name.en === "Cleaning"
  );
  await doing.client.work.claim({ id: morning?.id ?? "" });
  await doing.client.work.completeStep({
    instanceId: morning?.id ?? "",
    stepId: "clean",
    evidence: [true],
  });
  await doing.client.work.complete({ id: morning?.id ?? "" });
  return morning?.id ?? "";
};

describe("what was done today", () => {
  it("lists the work finished today in the Pens the person works, named and placed, and nobody else's Pen", async () => {
    const done = await cleanTheMorning(mine, "staff");
    await cleanTheMorning(theirs, "owner");

    const milker = await createTestClient(appRouter, {
      as: "staff",
      clock: new FakeClock(NOON),
    });
    const finished = await milker.client.work.doneToday();

    expect(finished.map((one) => one.id)).toEqual([done]);
    expect(finished[0]).toMatchObject({
      name: { en: "Cleaning" },
      pen: { name: `mine ${suffix}` },
    });
    // The evening's cleaning is still owed, so it stays on the list and is not done.
    const owed = await milker.client.work.today();
    expect(owed.map((one) => one.id)).not.toContain(done);
    expect(owed).toHaveLength(1);
  });

  it("starts afresh with the farm's next day", async () => {
    const tomorrow = await createTestClient(appRouter, {
      as: "staff",
      clock: new FakeClock(NEXT_NOON),
    });
    expect(await tomorrow.client.work.doneToday()).toEqual([]);
  });
});

import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  DAY,
  FakeClock,
  createTestPrincipal,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// When a milker was away, the Manager had either to hand his Pens to somebody and remember to take them back, or pin
// the jobs one at a time. A Cover hands them over for the day, and the day takes them back.

const suffix = `${Date.now()}`;

/** A Pen's cleaning twice a day, at five and five, with an hour of grace. */
const cleaning = (): SopContent => ({
  name: { bn: `পরিষ্কার ${suffix}`, en: `Cleaning ${suffix}` },
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

let penOfTheAbsent = "";
let theirCover = "";
let theAbsent = "";

/** A Pen with a heifer in it, for cleaning to be raised in. */
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
  penOfTheAbsent = await aPen(owner, "away");
  await createTestPrincipal("staff", new Date());
  await createTestPrincipal("otherStaff", new Date());
  theAbsent = thePerson("staff").id;
  theirCover = thePerson("otherStaff").id;
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-cover-${penOfTheAbsent}`,
      farmId: theFarm().id,
      userId: theAbsent,
      penId: penOfTheAbsent,
    })
    .onConflictDoNothing();
  await owner.client.sops.create({ content: cleaning() });
});

/** The farm's noon on a day of its own, so no test in this file meets another's Cover. */
const noonOf = (day: string) => `${day}T06:00:00.000Z`;

/** The Manager covers the absent milker's Pens for the day at `at`. */
const coverOn = async (at: string) => {
  const manager = await createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock(at),
  });
  await manager.client.work.ensureDue();
  const set = await manager.client.covers.set({
    absentUserId: theAbsent,
    coverUserId: theirCover,
  });
  return { manager, set };
};

/** The cover, as they read the farm at `at`. */
const theCoverAt = (at: string) =>
  createTestClient(appRouter, { as: "otherStaff", clock: new FakeClock(at) });

/** This file's cleaning in the absent milker's Pen, as somebody reads their list. */
const cleaningIn = <
  T extends { penId: string | null; version: { content: unknown } },
>(
  list: T[]
): T[] =>
  list.filter(
    (one) =>
      one.penId === penOfTheAbsent &&
      (one.version.content as SopContent).name.en === `Cleaning ${suffix}`
  );

/** This file's cleaning in the absent milker's Pen on the cover's own list at `at`. */
const onTheCoversListAt = async (at: string) => {
  const cover = await theCoverAt(at);
  const list = await cover.client.work.today();
  return cleaningIn(list);
};

describe("covering somebody away", () => {
  it("gives the cover the absent milker's Pens for the day, to see, take and finish their work", async () => {
    const at = noonOf("2089-04-10");
    await coverOn(at);

    const cover = await theCoverAt(at);
    const owed = cleaningIn(await cover.client.work.today());
    expect(owed.length).toBeGreaterThan(0);

    const [job] = owed;
    await cover.client.work.claim({ id: job?.id ?? "" });
    await cover.client.work.completeStep({
      instanceId: job?.id ?? "",
      stepId: "clean",
      evidence: [true],
    });
    await cover.client.work.complete({ id: job?.id ?? "" });
    const done = await cover.client.work.doneToday();
    expect(done.done.map((one) => one.id)).toContain(job?.id);
  });

  it("takes them back when the day turns", async () => {
    const at = noonOf("2089-04-20");
    await coverOn(at);
    const onTheDay = await onTheCoversListAt(at);
    expect(onTheDay.length).toBeGreaterThan(0);

    const nextDay = new Date(new Date(at).getTime() + DAY).toISOString();
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(nextDay),
    });
    await manager.client.work.ensureDue();
    expect(await onTheCoversListAt(nextDay)).toEqual([]);
  });

  it("takes them back when the Manager ends it early, and the absent milker keeps their own all along", async () => {
    const at = noonOf("2089-04-25");
    const { manager, set } = await coverOn(at);
    const before = await onTheCoversListAt(at);
    expect(before.length).toBeGreaterThan(0);
    await manager.client.covers.end({ id: set.id });

    expect(await onTheCoversListAt(at)).toEqual([]);
    const absent = await createTestClient(appRouter, {
      as: "staff",
      clock: new FakeClock(at),
    });
    expect(cleaningIn(await absent.client.work.today()).length).toBeGreaterThan(
      0
    );
    const today = await manager.client.covers.today();
    expect(today.covers.find((one) => one.id === set.id)?.endedAt).not.toBe(
      null
    );
  });

  it("is set by whoever runs the farm, never by Barn Staff, and never to cover themselves", async () => {
    const staff = await createTestClient(appRouter, { as: "staff" });
    await expect(
      staff.client.covers.set({
        absentUserId: theAbsent,
        coverUserId: theirCover,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const manager = await createTestClient(appRouter, { as: "manager" });
    await expect(
      manager.client.covers.set({
        absentUserId: theAbsent,
        coverUserId: theAbsent,
      })
    ).rejects.toMatchObject({ data: { refusal: "cover_is_themselves" } });
    await expect(
      manager.client.covers.set({
        absentUserId: theirCover,
        coverUserId: theAbsent,
      })
    ).rejects.toMatchObject({ data: { refusal: "cover_no_pens" } });
  });

  it("keeps what the cover recorded that day on a phone that brings it in after the cover has ended", async () => {
    const at = noonOf("2089-05-02");
    await coverOn(at);
    const cover = await theCoverAt(at);
    const [job] = cleaningIn(await cover.client.work.today());
    await cover.client.work.claim({ id: job?.id ?? "" });

    // The next morning the phone finds signal and sends the step it took on the cover's day.
    const nextDay = new Date(new Date(at).getTime() + DAY).toISOString();
    const phone = await createTestClient(appRouter, {
      as: "otherStaff",
      clock: new FakeClock(nextDay),
    });
    const sent = await phone.client.sync.batch({
      key: `cover-late-${job?.id}`,
      entries: [
        {
          id: `cover-step-${job?.id}`,
          seq: 1,
          recordedAt: new Date(at),
          kind: "step_completion" as const,
          instanceId: job?.id ?? "",
          stepId: "clean",
          evidence: [true],
        },
      ],
    });
    expect(sent.results.map((one) => one.outcome)).toEqual(["applied"]);
  });
});

import { cover as coverTable, penAssignment } from "@OpenFarm/db/schema/herd";
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
/** A Pen nobody keeps until a test hands it to the one away. */
let penLater = "";
let theirCover = "";
let theAbsent = "";
/** The cover's Outbox count: one phone's numbers never repeat, and the first describe's entry took number one. */
let sequence = 100;

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
  penLater = await aPen(owner, "later");
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

/** The Manager covers the absent milker's Pens for the day at `at`, the day's work raised first unless told not to. */
const coverOn = async (at: string, { raise = true } = {}) => {
  const manager = await createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock(at),
  });
  if (raise) {
    await manager.client.work.ensureDue();
  }
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

/** A cleaning step as the cover's phone holds it: done at `at`. Each entry its own number on the cover's Outbox. */
const cleaned = (instanceId: string, at: string) => {
  sequence += 1;
  return {
    id: `cover-step-${sequence}-${instanceId}`,
    seq: sequence,
    recordedAt: new Date(at),
    kind: "step_completion" as const,
    instanceId,
    stepId: "clean",
    evidence: [true],
  };
};

/** The next day at the same hour. */
const dayAfter = (at: string) =>
  new Date(new Date(at).getTime() + DAY).toISOString();

/** What the cover's own phone is told of one entry it sends at `at`. */
const sentByTheCover = async (
  at: string,
  entry: ReturnType<typeof cleaned>
) => {
  const phone = await theCoverAt(at);
  const sent = await phone.client.sync.batch({
    key: `cover-batch-${entry.id}`,
    entries: [entry],
  });
  return sent.results[0];
};

/** This file's cleaning in a Pen, as the Manager reads the farm at `at`, the morning's first. */
const cleaningOfThePen = async (penId: string, at: string) => {
  const manager = await createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock(at),
  });
  await manager.client.work.ensureDue();
  const all = await manager.client.work.today({ penId });
  return all
    .filter(
      (one) =>
        (one.version.content as SopContent).name.en === `Cleaning ${suffix}`
    )
    .toSorted((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
};

describe("a Cover read as it stood", () => {
  it("lets the Manager take in, from Needs Review, what the cover recorded that day and a phone brought in late", async () => {
    const at = noonOf("2089-05-10");
    await coverOn(at);
    const [job] = await onTheCoversListAt(at);
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(at),
    });
    await manager.client.work.closeAsMissed({
      id: job?.id ?? "",
      reason: "কেউ ছিল না",
    });

    const entry = cleaned(job?.id ?? "", at);
    expect(await sentByTheCover(dayAfter(at), entry)).toMatchObject({
      outcome: "kept",
    });
    const nextDay = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(dayAfter(at)),
    });
    const queue = await nextDay.client.reviewQueue.list();
    const waiting = queue.find((row) => row.entityId === entry.id);
    await nextDay.client.reviewQueue.takeIn({ id: waiting?.id ?? "" });
    expect(
      await scratchDb().query.stepCompletion.findFirst({
        where: { id: entry.id },
        columns: { id: true },
      })
    ).toBeDefined();
  });

  it("never lends work of an earlier day the Cover set today", async () => {
    const earlier = noonOf("2089-05-20");
    const [job] = await cleaningOfThePen(penOfTheAbsent, earlier);
    await coverOn(dayAfter(earlier), { raise: false });

    expect(
      await sentByTheCover(dayAfter(earlier), cleaned(job?.id ?? "", earlier))
    ).toMatchObject({ refusal: { category: "not_yours" } });
  });

  it("tells the cover of the absent milker's work going late, and not the one away", async () => {
    // Half past six on the farm: the morning's cleaning, due at five with an hour's grace, has gone late.
    const at = "2089-05-30T00:30:00.000Z";
    const { manager } = await coverOn(at, { raise: false });
    const [morning] = await cleaningOfThePen(penOfTheAbsent, at);
    await manager.client.alerts.sweep();

    const told = async (as: "staff" | "otherStaff") => {
      const who = await createTestClient(appRouter, {
        as,
        clock: new FakeClock(at),
      });
      const mine = await who.client.alerts.mine({ entityId: morning?.id });
      return mine.map((one) => one.kind);
    };
    expect(await told("otherStaff")).toContain("instance_overdue");
    expect(await told("staff")).not.toContain("instance_overdue");
  });

  it("lets the cover take the work the one away had already taken", async () => {
    const at = noonOf("2089-06-05");
    const [job] = await cleaningOfThePen(penOfTheAbsent, at);
    const absent = await createTestClient(appRouter, {
      as: "staff",
      clock: new FakeClock(at),
    });
    await absent.client.work.claim({ id: job?.id ?? "" });
    await coverOn(at, { raise: false });

    const cover = await theCoverAt(at);
    await cover.client.work.claim({ id: job?.id ?? "" });
    const taken = await scratchDb().query.sopInstance.findFirst({
      where: { id: job?.id ?? "" },
      columns: { claimedBy: true },
    });
    expect(taken?.claimedBy).toBe(theirCover);
  });

  it("keeps one Cover standing for one person on one day, and puts the one it replaced on the trail as ended", async () => {
    const at = noonOf("2089-06-10");
    const { manager, set: first } = await coverOn(at, { raise: false });
    const second = await manager.client.covers.set({
      absentUserId: theAbsent,
      coverUserId: theirCover,
    });

    const today = await manager.client.covers.today();
    expect(
      today.covers.filter((one) => one.endedAt === null).map((one) => one.id)
    ).toEqual([second.id]);
    const trail = await scratchDb().query.auditEvent.findMany({
      where: { entity: "cover", entityId: first.id, action: "update" },
      columns: { id: true },
    });
    expect(trail).toHaveLength(1);
    await expect(
      scratchDb()
        .insert(coverTable)
        .values({
          id: `cover-twice-${suffix}`,
          farmId: theFarm().id,
          absentUserId: theAbsent,
          coverUserId: theirCover,
          day: "2089-06-10",
          setBy: thePerson("manager").id,
          setAt: new Date(at),
        })
    ).rejects.toThrow();
  });

  it("reads the absent milker's Pens as they stood on the Cover's day, not as they stand after", async () => {
    const at = noonOf("2089-06-20");
    await coverOn(at);
    const [laterJob] = await cleaningOfThePen(penLater, at);
    // Handed to the one away only the next day: on the Cover's day it was nobody's.
    await scratchDb()
      .insert(penAssignment)
      .values({
        id: `pa-cover-later-${penLater}`,
        farmId: theFarm().id,
        userId: theAbsent,
        penId: penLater,
        createdAt: new Date(dayAfter(at)),
      })
      .onConflictDoNothing();

    expect(
      await sentByTheCover(dayAfter(at), cleaned(laterJob?.id ?? "", at))
    ).toMatchObject({ refusal: { category: "not_yours" } });
  });
});

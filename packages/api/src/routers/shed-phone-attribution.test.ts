import { and, eq } from "@OpenFarm/db/operators";
import { auditEvent } from "@OpenFarm/db/schema/audit";
import { deviceSwitch } from "@OpenFarm/db/schema/device";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { needsReview } from "@OpenFarm/db/schema/review";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { hashToken } from "../device";
import { aMonthOn } from "../test/carrying";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Work recorded on a shared Shed Phone belongs to whoever recorded it — not to whoever happens to be switched in
// when the phone next finds signal.

const suffix = `${Date.now()}`;
const PHONE = { id: `phone-attr-${suffix}`, name: `গোয়াল ফোন ${suffix}` };

const milkingSop = (): SopContent => ({
  name: { bn: `দোহন ${suffix}`, en: "Milking" },
  purpose: { bn: "প্রতিটি গাভীর দুধ" },
  triggers: [{ kind: "schedule", times: ["05:00"] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 90,
  steps: [
    {
      id: "milk",
      text: { bn: "দোহন করুন" },
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
  const ownerClient = await createTestClient(appRouter, { as: "owner" });
  const { client: owner } = ownerClient;
  const shed = await owner.sheds.create({ name: `attr-${suffix}` });
  const pen = await owner.sheds.pens.create({
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  const cow = await owner.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  await owner.animals.setState({
    tagNumber: cow.tagNumber,
    state: "pregnant_heifer",
    expectedCalvingOn: aMonthOn(ownerClient),
  });
  await owner.animals.setState({ tagNumber: cow.tagNumber, state: "milking" });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-attr-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const sop = await owner.sops.create({ content: milkingSop() });
  return { pen, cow, sop };
};

let world: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  world = await setup();
});

let counter = 0;
const counted = () => {
  counter += 1;
  return counter;
};

/** A claimed milking Instance on its own day, and the Shed Phone with the Staff member's PIN on it. */
const morning = async (day: string) => {
  const clock = new FakeClock(`${day}T05:30:00.000Z`);
  const { client: scheduler } = await createTestClient(appRouter, {
    as: "owner",
    clock,
  });
  await scheduler.work.ensureDue();
  const today = await scheduler.work.today({ penId: world.pen.id });
  const instance = today.find(
    (row) => row.definitionId === world.sop.definitionId
  );
  if (!instance) {
    throw new Error(`expected an instance on ${day}`);
  }
  const { client: staff } = await createTestClient(appRouter, {
    as: "staff",
    clock,
  });
  await staff.work.claim({ id: instance.id });
  // The Staff member's PIN on the shared phone, then another hand in the barn switched in on it.
  await createTestClient(appRouter, {
    as: "staff",
    clock,
    onShedPhone: true,
    phone: PHONE,
  });
  const { client: other } = await createTestClient(appRouter, {
    as: "otherStaff",
    clock,
    onShedPhone: true,
    phone: PHONE,
  });
  return { instance, clock, staff, other };
};

/** That somebody entered their PIN on the shared phone at this moment, as `devices.switchUser` records it: the
 *  token the phone was given for it. */
const provedPin = async (userId: string, at: Date) => {
  const token = `switch-attr-${suffix}-${counted()}`;
  await scratchDb()
    .insert(deviceSwitch)
    .values({
      id: token,
      deviceId: PHONE.id,
      userId,
      tokenHash: await hashToken(token),
      expiresAt: new Date(at.getTime() + 5 * 60_000),
      createdAt: at,
    });
  return token;
};

const milked = (
  instanceId: string,
  actorId: string | undefined,
  at: Date,
  switchToken?: string
) => ({
  id: `attr-${suffix}-${counted()}`,
  seq: 10_000 + counted(),
  kind: "step_completion" as const,
  instanceId,
  stepId: "milk",
  animalTag: world.cow.tagNumber,
  evidence: [12],
  recordedAt: at,
  ...(actorId ? { actorId } : {}),
  ...(switchToken ? { switchToken } : {}),
});

describe("who recorded work on a Shed Phone", () => {
  it("keeps the name of the person who recorded it, whoever is switched in when it is sent", async () => {
    const { instance, clock, staff, other } = await morning("2031-03-01");
    const token = await provedPin(thePerson("staff").id, clock.now());

    const sent = await other.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [milked(instance.id, thePerson("staff").id, clock.now(), token)],
    });

    expect(sent.results[0]?.outcome).toBe("applied");
    const board = await staff.work.get({ id: instance.id });
    expect(board.completions[0]).toMatchObject({
      recordedBy: thePerson("staff").id,
      deviceId: PHONE.id,
    });
    // Written under the Role they hold, not the one of whoever sent it: a Staff member's Pens are checked by it.
    const [event] = await scratchDb()
      .select({ roleUsed: auditEvent.roleUsed })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.entity, "step_completion"),
          eq(auditEvent.actorId, thePerson("staff").id),
          eq(auditEvent.deviceId, PHONE.id)
        )
      )
      .limit(1);
    expect(event?.roleUsed).toBe("staff");
  });

  it("keeps the name of the person whose PIN reached the farm days after the work, the phone out of signal since", async () => {
    // Milked on the 10th with no signal; the phone found signal on the 12th and proved her PIN then.
    const { instance, clock, staff, other } = await morning("2031-03-10");
    const milkedAt = clock.now();
    clock.advance(2 * 24 * 60 * 60 * 1000);
    const token = await provedPin(thePerson("staff").id, clock.now());
    const sent = await other.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [milked(instance.id, thePerson("staff").id, milkedAt, token)],
    });
    expect(sent.results[0]?.outcome).toBe("applied");
    const board = await staff.work.get({ id: instance.id });
    expect(board.completions[0]).toMatchObject({
      recordedBy: thePerson("staff").id,
    });
  });

  it("keeps an hour's milking hers when the signal went a minute after her PIN and the next hand sends it", async () => {
    // Three more cows in her Pen, so the milking runs on cow after cow.
    const ownerClient = await createTestClient(appRouter, { as: "owner" });
    const { client: owner } = ownerClient;
    const cows = [world.cow.tagNumber];
    for (const _ of [1, 2, 3]) {
      // oxlint-disable-next-line no-await-in-loop
      const cow = await owner.animals.register({
        sex: "female",
        side: "dairy",
        state: "heifer",
        penId: world.pen.id,
        source: "born",
        aliases: [],
      });
      // oxlint-disable-next-line no-await-in-loop
      await owner.animals.setState({
        tagNumber: cow.tagNumber,
        state: "pregnant_heifer",
        expectedCalvingOn: aMonthOn(ownerClient),
      });
      // oxlint-disable-next-line no-await-in-loop
      await owner.animals.setState({
        tagNumber: cow.tagNumber,
        state: "milking",
      });
      cows.push(cow.tagNumber);
    }
    const { instance, clock, staff, other } = await morning("2031-03-06");
    // Her PIN reached the farm at 05:30; keep-awake never did again, so on the farm's side her stint ran out at 05:35.
    const token = await provedPin(thePerson("staff").id, clock.now());
    const pinned = clock.now().getTime();
    const minutes = (n: number) => new Date(pinned + n * 60_000);
    // The feeder PINs in at nine, and the phone sends what it held.
    clock.advance(3.5 * 60 * 60_000);
    const sent = await other.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: cows.map((tag, i) => ({
        ...milked(
          instance.id,
          thePerson("staff").id,
          minutes(12 * (i + 1)),
          token
        ),
        animalTag: tag,
      })),
    });
    // 05:42, 05:54, 06:06, 06:18: each within her lock window of the one before.
    expect(sent.results.map((one) => one.outcome)).toEqual([
      "applied",
      "applied",
      "applied",
      "applied",
    ]);
    const board = await staff.work.get({ id: instance.id });
    expect(
      board.completions.filter(
        (one) => one.recordedBy === thePerson("staff").id
      )
    ).toHaveLength(4);
  });

  it("keeps for the Manager, and never writes, work naming somebody without the token their PIN earned on this phone for it", async () => {
    const { instance, clock, other } = await morning("2031-03-04");
    // They did enter their PIN here this morning — but whoever sends cannot just say so.
    const theirs = await provedPin(thePerson("staff").id, clock.now());
    // Nor reuse a token from two days ago for this morning's work.
    const old = await provedPin(
      thePerson("staff").id,
      new Date(clock.now().getTime() - 2 * 24 * 60 * 60_000)
    );

    const sent = await other.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [
        milked(instance.id, thePerson("staff").id, clock.now()),
        milked(instance.id, thePerson("staff").id, clock.now(), old),
        milked(
          instance.id,
          thePerson("staff").id,
          clock.now(),
          `${theirs}-guessed`
        ),
      ],
    });

    // Kept for the Manager to judge, and nothing of it in the records: the farm cannot say it was theirs.
    expect(sent.results.map((result) => result.outcome)).toEqual([
      "kept",
      "kept",
      "kept",
    ]);
    expect(sent.results[0]?.refusal?.word).toBe("pin_not_proved");
    const written = await scratchDb().query.stepCompletion.findMany({
      where: { instanceId: instance.id },
      columns: { id: true },
    });
    expect(written).toHaveLength(0);
  });

  it("refuses work naming somebody who has no PIN on this farm", async () => {
    const { instance, clock, other } = await morning("2031-03-02");

    const sent = await other.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [milked(instance.id, thePerson("newcomer").id, clock.now())],
    });

    expect(sent.results[0]?.outcome).toBe("rejected");
  });

  it("refuses, from a person's own phone, work naming somebody else", async () => {
    const { instance, clock, staff } = await morning("2031-03-03");

    const sent = await staff.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [milked(instance.id, thePerson("manager").id, clock.now())],
    });

    expect(sent.results[0]?.outcome).toBe("rejected");
  });
});

describe("work a Shed Phone held while things changed", () => {
  it("is still hers when it reaches the farm on the phone enrolled again under a new name", async () => {
    // Milked on the 1st of May on the old enrollment; the phone was enrolled afresh before it found signal.
    const { instance, clock, staff } = await morning("2031-05-01");
    const token = await provedPin(thePerson("staff").id, clock.now());
    const { client: again } = await createTestClient(appRouter, {
      as: "otherStaff",
      clock,
      onShedPhone: true,
      phone: { id: `phone-again-${suffix}`, name: `নতুন নাম ${suffix}` },
    });
    const sent = await again.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [milked(instance.id, thePerson("staff").id, clock.now(), token)],
    });
    expect(sent.results[0]?.outcome).toBe("applied");
    const board = await staff.work.get({ id: instance.id });
    expect(board.completions[0]).toMatchObject({
      recordedBy: thePerson("staff").id,
    });
  });

  it("is still hers when her Pen was handed to somebody else after she milked it, before the phone found signal", async () => {
    // Milked at 05:30 with no signal; the Manager gave her Pen to another hand at 07:30; the phone sent at 08:30.
    const { instance, clock } = await morning("2031-06-05");
    const milkedAt = clock.now();
    const handedOn = new Date(milkedAt.getTime() + 2 * 60 * 60_000);
    await scratchDb()
      .update(penAssignment)
      .set({ endedAt: handedOn })
      .where(eq(penAssignment.id, `pa-attr-${world.pen.id}`));
    try {
      clock.advance(3 * 60 * 60_000);
      // Her phone, as the farm knows her now.
      const { client: staff } = await createTestClient(appRouter, {
        as: "staff",
        clock,
      });
      // Nothing she says she did in it after it was handed on.
      const after = await staff.sync.batch({
        key: `attr-${suffix}-${counted()}`,
        entries: [
          milked(
            instance.id,
            undefined,
            new Date(handedOn.getTime() + 30 * 60_000)
          ),
        ],
      });
      expect(after.results[0]?.refusal?.word).toBe("pen_not_yours");
      const sent = await staff.sync.batch({
        key: `attr-${suffix}-${counted()}`,
        entries: [milked(instance.id, undefined, milkedAt)],
      });
      expect(sent.results[0]?.outcome).toBe("applied");
    } finally {
      await scratchDb()
        .update(penAssignment)
        .set({ endedAt: null })
        .where(eq(penAssignment.id, `pa-attr-${world.pen.id}`));
    }
  });

  it("is still hers when it reaches the farm after she has left, done before she did", async () => {
    // Milked at dawn on the 2nd of June with no signal; the Owner disabled her at noon; the phone found signal after.
    const { instance, clock, other } = await morning("2031-06-02");
    const milkedAt = clock.now();
    const token = await provedPin(thePerson("staff").id, milkedAt);
    const noon = new FakeClock("2031-06-02T06:00:00.000Z");
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock: noon,
    });
    await owner.people.disable({ userId: thePerson("staff").id });
    try {
      const sent = await other.sync.batch({
        key: `attr-${suffix}-${counted()}`,
        entries: [
          milked(instance.id, thePerson("staff").id, milkedAt, token),
          // And nothing she is said to have done after she left.
          milked(
            instance.id,
            thePerson("staff").id,
            new Date("2031-06-02T07:00:00.000Z"),
            token
          ),
        ],
      });
      expect(sent.results.map((one) => one.outcome)).toEqual([
        "applied",
        "rejected",
      ]);
    } finally {
      await owner.people.enable({ userId: thePerson("staff").id });
    }
  });
});

describe("work the farm held, taken in by the Manager", () => {
  beforeAll(async () => {
    // Her leaving, above, ended her Pen; she is back on it.
    await scratchDb()
      .update(penAssignment)
      .set({ endedAt: null })
      .where(eq(penAssignment.id, `pa-attr-${world.pen.id}`));
  });

  it("writes a milking done before the Manager closed the work as Missed, once the Manager takes it in", async () => {
    // Milked at 05:30 with no signal; the Manager closed the milking as Missed at eight; the phone sent at nine.
    const { instance, clock } = await morning("2031-07-01");
    const milkedAt = clock.now();
    const token = await provedPin(thePerson("staff").id, milkedAt);
    clock.advance(150 * 60_000);
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock,
    });
    await manager.work.closeAsMissed({
      id: instance.id,
      reason: "দোহনের কেউ ছিল না",
    });
    clock.advance(60 * 60_000);
    const { client: other } = await createTestClient(appRouter, {
      as: "otherStaff",
      clock,
      onShedPhone: true,
      phone: PHONE,
    });
    const entry = milked(instance.id, thePerson("staff").id, milkedAt, token);
    const sent = await other.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [entry],
    });
    expect(sent.results[0]).toMatchObject({
      outcome: "kept",
      refusal: { category: "late", word: "work_closed" },
    });
    const liters = () =>
      scratchDb().query.milkRecord.findFirst({
        where: { completionId: entry.id },
        columns: { liters: true, recordedBy: true },
      });
    expect(await liters()).toBeUndefined();

    const queue = await manager.reviewQueue.list();
    const waiting = queue.find((row) => row.entityId === entry.id);
    // What she entered, about which cow, by whom, and why it was held — and the work it was meant for.
    expect(waiting).toMatchObject({
      instanceId: instance.id,
      held: {
        kind: "step_completion",
        animalTag: world.cow.tagNumber,
        evidence: [12],
        recordedBy: thePerson("staff").name,
        refusal: { word: "work_closed" },
        mayTakeIn: true,
      },
    });
    await manager.reviewQueue.takeIn({ id: waiting?.id ?? "" });

    // Her liters, under her name, on the work the Manager had closed.
    expect(await liters()).toMatchObject({
      recordedBy: thePerson("staff").id,
    });
    const after = await manager.reviewQueue.list();
    expect(after.some((row) => row.id === waiting?.id)).toBe(false);
    // Asked again, the phone is told it is in the records; taken in twice, nothing changes.
    const again = await other.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [entry],
    });
    expect(again.results[0]?.outcome).toBe("applied");
    await expect(
      manager.reviewQueue.takeIn({ id: waiting?.id ?? "" })
    ).rejects.toMatchObject({ data: { refusal: "review_closed" } });
  });

  it("writes work kept because nothing showed who was switched in, under the person it names, once the Manager takes it in", async () => {
    const { instance, clock, other } = await morning("2031-07-02");
    // Her PIN was entered with no signal and lost with the tab: nothing proves it.
    const entry = milked(instance.id, thePerson("staff").id, clock.now());
    const sent = await other.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [entry],
    });
    expect(sent.results[0]?.refusal?.word).toBe("pin_not_proved");
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock,
    });
    const queue = await manager.reviewQueue.list();
    const waiting = queue.find((row) => row.entityId === entry.id);
    await manager.reviewQueue.takeIn({
      id: waiting?.id ?? "",
      note: "রহিমা নিজে বলেছে সে দুইয়েছে",
    });
    const board = await manager.work.get({ id: instance.id });
    expect(board.completions[0]).toMatchObject({
      recordedBy: thePerson("staff").id,
      deviceId: PHONE.id,
    });
  });

  it("is refused, and changes nothing, where the farm still cannot take it", async () => {
    const { instance, clock, other, staff } = await morning("2031-07-03");
    const token = await provedPin(thePerson("staff").id, clock.now());
    // Recorded with signal at 05:30 as 12 liters; the phone held a second answer of 9 for the same cow.
    await other.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [milked(instance.id, thePerson("staff").id, clock.now(), token)],
    });
    const second = {
      ...milked(instance.id, thePerson("staff").id, clock.now(), token),
      evidence: [9],
    };
    const sent = await other.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [second],
    });
    expect(sent.results[0]?.outcome).toBe("kept");
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock,
    });
    const queue = await manager.reviewQueue.list();
    const waiting = queue.find((row) => row.entityId === second.id);
    await expect(
      manager.reviewQueue.takeIn({ id: waiting?.id ?? "" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // Still waiting, and the first answer stands.
    const still = await manager.reviewQueue.list();
    expect(still.some((row) => row.id === waiting?.id)).toBe(true);
    const board = await staff.work.get({ id: instance.id });
    expect(board.completions).toHaveLength(1);
  });
});

describe("a Shed Phone locked on the shelf", () => {
  beforeAll(async () => {
    await scratchDb()
      .update(penAssignment)
      .set({ endedAt: null })
      .where(eq(penAssignment.id, `pa-attr-${world.pen.id}`));
  });

  it("sends what it holds when its signal comes back, each entry under the person its token proves", async () => {
    const { instance, clock } = await morning("2031-08-01");
    const milkedAt = clock.now();
    const token = await provedPin(thePerson("staff").id, milkedAt);
    // She put the phone back at six; it found signal at seven with nobody switched in.
    clock.advance(90 * 60_000);
    const { client: shelf } = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: PHONE,
      locked: true,
    });
    const proved = milked(instance.id, thePerson("staff").id, milkedAt, token);
    // And somebody else's, with nothing to prove it: never taken on the strength of hers.
    const unproved = {
      ...milked(instance.id, thePerson("otherStaff").id, milkedAt),
      animalTag: `${world.cow.tagNumber}`,
      stepId: "milk",
    };
    const sent = await shelf.sync.fromTheShelf({
      key: `attr-${suffix}-${counted()}`,
      entries: [proved, unproved],
    });
    expect(sent.results.map((one) => one.outcome)).toEqual(["applied", "kept"]);
    const written = await scratchDb().query.stepCompletion.findFirst({
      where: { id: proved.id },
      columns: { recordedBy: true, deviceId: true },
    });
    expect(written).toEqual({
      recordedBy: thePerson("staff").id,
      deviceId: PHONE.id,
    });
  });

  it("asks for a PIN when nothing it holds proves anybody", async () => {
    const { instance, clock } = await morning("2031-08-02");
    const { client: shelf } = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: PHONE,
      locked: true,
    });
    await expect(
      shelf.sync.fromTheShelf({
        key: `attr-${suffix}-${counted()}`,
        entries: [milked(instance.id, thePerson("staff").id, clock.now())],
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("is refused from anything but a Shed Phone", async () => {
    const { instance, clock, staff } = await morning("2031-08-03");
    await expect(
      staff.sync.fromTheShelf({
        key: `attr-${suffix}-${counted()}`,
        entries: [milked(instance.id, thePerson("staff").id, clock.now())],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("the day turning when somebody opens the app", () => {
  it("is filed as the farm's own act, not as whoever opened it", async () => {
    const day = "2031-09-01";
    const clock = new FakeClock(`${day}T05:30:00.000Z`);
    // The milker opens the app at half past five, and the day's milking is raised.
    const { client: milker } = await createTestClient(appRouter, {
      as: "staff",
      clock,
    });
    await milker.work.ensureDue();
    const [raised] = await scratchDb()
      .select({ actorId: auditEvent.actorId, roleUsed: auditEvent.roleUsed })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.farmId, theFarm().id),
          eq(auditEvent.entityId, `schedule:${day}`)
        )
      );
    expect(raised).toEqual({ actorId: null, roleUsed: null });
  });
});

describe("a stint ended on purpose", () => {
  it("is not opened again by work sent later under its token: done before the Lock it counts, after it it does not", async () => {
    const { instance, clock, other } = await morning("2031-09-10");
    const pinned = clock.now();
    const token = await provedPin(thePerson("staff").id, pinned);
    // She locks the phone a minute after her PIN.
    clock.advance(60_000);
    const { client: hers } = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: PHONE,
    });
    await hers.devices.lock();
    const lockedAt = clock.now();
    clock.advance(2 * 60_000);
    const { client: shelf } = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: PHONE,
      locked: true,
    });
    const before = milked(instance.id, thePerson("staff").id, pinned, token);
    const after = {
      ...milked(
        instance.id,
        thePerson("staff").id,
        new Date(lockedAt.getTime() + 15 * 60_000),
        token
      ),
      animalTag: `${world.cow.tagNumber}`,
    };
    const sent = await shelf.sync.fromTheShelf({
      key: `attr-${suffix}-${counted()}`,
      entries: [before],
    });
    expect(sent.results[0]?.outcome).toBe("applied");
    // On the shelf, nothing it holds proves anybody now: it waits for a PIN.
    await expect(
      shelf.sync.fromTheShelf({
        key: `attr-${suffix}-${counted()}`,
        entries: [after],
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    // The next hand PINs in and it goes: kept for the Manager, never taken as hers.
    const late = await other.sync.batch({
      key: `attr-${suffix}-${counted()}`,
      entries: [after],
    });
    expect(late.results[0]?.refusal?.word).toBe("pin_not_proved");
    // And the stint stays ended where the Lock ended it.
    const [stint] = await scratchDb()
      .select({
        expiresAt: deviceSwitch.expiresAt,
        endedAt: deviceSwitch.endedAt,
      })
      .from(deviceSwitch)
      .where(eq(deviceSwitch.id, token));
    expect(stint?.endedAt).toEqual(lockedAt);
    expect(stint?.expiresAt.getTime()).toBeLessThanOrEqual(lockedAt.getTime());
  });

  it("is ended by a new PIN even once it has run out, so nothing queued under the old one opens it", async () => {
    const { clock } = await morning("2031-09-11");
    const token = await provedPin(thePerson("staff").id, clock.now());
    clock.advance(30 * 60_000);
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock,
    });
    await owner.people.setPin({ userId: thePerson("staff").id, pin: "4826" });
    const [stint] = await scratchDb()
      .select({ endedAt: deviceSwitch.endedAt })
      .from(deviceSwitch)
      .where(eq(deviceSwitch.id, token));
    expect(stint?.endedAt).toEqual(clock.now());
  });
});

describe("how many are waiting", () => {
  it("counts every Needs Review waiting, though the list carries only the oldest hundred", async () => {
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
    });
    const [anyEvent] = await scratchDb()
      .select({ id: auditEvent.id })
      .from(auditEvent)
      .where(eq(auditEvent.farmId, theFarm().id))
      .limit(1);
    const { waiting: before } = await manager.reviewQueue.waiting();
    await scratchDb()
      .insert(needsReview)
      .values(
        Array.from({ length: 101 }, (_, i) => ({
          id: `waiting-${suffix}-${i}`,
          farmId: theFarm().id,
          entity: "weigh_in",
          entityId: `waiting-${suffix}-${i}`,
          reason: "implausible_weight" as const,
          auditEventId: anyEvent?.id ?? "",
          raisedAt: new Date(),
        }))
      );
    const listed = await manager.reviewQueue.list();
    const { waiting } = await manager.reviewQueue.waiting();
    expect(listed).toHaveLength(100);
    expect(waiting).toBe(before + 101);
  });
});

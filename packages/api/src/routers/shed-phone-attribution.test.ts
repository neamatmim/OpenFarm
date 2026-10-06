import { and, eq } from "@OpenFarm/db/operators";
import { auditEvent } from "@OpenFarm/db/schema/audit";
import { deviceSwitch } from "@OpenFarm/db/schema/device";
import { penAssignment } from "@OpenFarm/db/schema/herd";
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

  it("refuses work naming somebody without the token their PIN earned on this phone for it", async () => {
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

    expect(sent.results.map((result) => result.outcome)).toEqual([
      "rejected",
      "rejected",
      "rejected",
    ]);
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
    // Milked on the 1st of May on the old enrolment; the phone was enrolled afresh before it found signal.
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

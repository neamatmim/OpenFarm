import { eq } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";
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

const suffix = `${Date.now()}`;
const MINUTE_MS = 60_000;

/** A one-Step SOP due at 05:00 with half an hour of grace, checked by the Manager. */
const sop = (over: Partial<SopContent> = {}): SopContent => ({
  name: { bn: `পরিষ্কার ${suffix}`, en: "Cleaning" },
  purpose: { bn: "শেড পরিষ্কার" },
  triggers: [{ kind: "schedule", times: ["05:00"] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 30,
  steps: [
    {
      id: "clean",
      text: { bn: "শেড পরিষ্কার করুন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
  ...over,
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({
    name: `signoff-${suffix}`,
  });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  await owner.client.animals.setState({
    tagNumber: cow.tagNumber,
    state: "pregnant_heifer",
  });
  await owner.client.animals.setState({
    tagNumber: cow.tagNumber,
    state: "milking",
  });

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-signoff-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();

  const checked = await owner.client.sops.create({ content: sop() });
  const unchecked = await owner.client.sops.create({
    content: sop({
      name: { bn: `খাওয়ানো ${suffix}` },
      checkerRole: null,
      triggers: [{ kind: "schedule", times: ["06:00"] }],
    }),
  });
  /** An SOP the Vet does and the Manager checks, for the Roles the queue must still reach. */
  const vetChecked = await owner.client.sops.create({
    content: sop({
      name: { bn: `টিকা ${suffix}` },
      assignedRole: "vet",
      checkerRole: "staff",
      triggers: [{ kind: "schedule", times: ["04:00"] }],
    }),
  });
  return { owner, pen, checked, unchecked, vetChecked };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/**
 * Puts the farm's Alert watermark back to a chosen instant.
 *
 * The sweep deliberately only looks at what has gone late since it last looked, and that
 * mark is the Farm's — one row, which the tests in this file share. Each works in a fake
 * year of its own, so one would otherwise carry the mark past the next, which would then
 * find its own work already behind it. Each test says where its own window starts.
 */
const sweepFrom = async (at: Date) => {
  await scratchDb()
    .update(farm)
    .set({ alertsSweptFrom: at })
    .where(eq(farm.id, theFarm().id));
};

/** The SOP falls due at 05:00 Dhaka — 23:00 UTC the evening before. */
const dueAtUtc = (day: string) => new Date(`${day}T23:00:00.000Z`);
/** The instant `minutes` after it fell due. */
const after = (day: string, minutes: number) =>
  new Date(dueAtUtc(day).getTime() + minutes * MINUTE_MS);

type Role = "owner" | "manager" | "staff";

/** A client for a Role, reading the clock the test is driving. */
const as = async (role: Role, clock: FakeClock) => {
  const made = await createTestClient(appRouter, { as: role, clock });
  return made.client;
};

/** Raises the day's work and hands back the Instance of the SOP asked for. */
const workFor = async (
  day: string,
  at: string,
  definitionId = world.checked.definitionId
) => {
  const clock = new FakeClock(`${day}T${at}`);
  const scheduler = await as("owner", clock);
  await scheduler.instances.ensureDue();
  const today = await scheduler.instances.today({ penId: world.pen.id });
  const instance = today.find(
    (candidate) => candidate.definitionId === definitionId
  );
  if (!instance) {
    throw new Error(`expected an instance on ${day}`);
  }
  await sweepFrom(dueAtUtc(day));
  return { instance, clock };
};

/** Work claimed, done and handed to the checker. */
const doneWork = async (day: string) => {
  const { instance, clock } = await workFor(day, "23:10:00.000Z");
  const staff = await as("staff", clock);
  await staff.instances.claim({ id: instance.id });
  await staff.instances.completeStep({
    instanceId: instance.id,
    stepId: "clean",
    evidence: [true],
  });
  await staff.instances.complete({ id: instance.id });
  return { instance, clock, staff };
};

/**
 * Sweeps until the farm has nothing new to say. One sweep raises notices in batches, so a single sweep is not
 * guaranteed to have reached this test's own Instance when the file has left other work open. Catching up first is
 * what a real farm's second and third app-open do anyway.
 */
const sweepUntilQuiet = async (client: {
  alerts: { sweep: () => Promise<{ overdue: number; escalated: number }> };
}) => {
  for (let pass = 0; pass < 20; pass += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const swept = await client.alerts.sweep();
    if (swept.overdue + swept.escalated === 0) {
      return;
    }
  }
  throw new Error("the sweep never went quiet");
};

const alertFor = (
  inbox: { kind: string; entityId: string; id: string }[],
  instanceId: string,
  kind: string
) => inbox.find((row) => row.entityId === instanceId && row.kind === kind);

describe("going late", () => {
  it("is not overdue inside the grace, and is once it has run out", async () => {
    // Due 05:00 Dhaka with 30 minutes of grace, so late from 05:30.
    const { instance, clock } = await workFor("2026-11-01", "23:05:00.000Z");
    const manager = await as("manager", clock);

    const onTime = await manager.instances.today({ penId: world.pen.id });
    expect(onTime.find((row) => row.id === instance.id)?.overdue).toBe(false);

    clock.set(after("2026-11-01", 29));
    const inGrace = await manager.instances.today({ penId: world.pen.id });
    expect(inGrace.find((row) => row.id === instance.id)?.overdue).toBe(false);

    clock.set(after("2026-11-01", 31));
    const late = await manager.instances.today({ penId: world.pen.id });
    expect(late.find((row) => row.id === instance.id)?.overdue).toBe(true);
  });

  it("tells the Manager and the person it is on, once however often the sweep runs", async () => {
    const { instance, clock } = await workFor("2026-11-02", "23:05:00.000Z");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });

    clock.set(after("2026-11-02", 45));
    const manager = await as("manager", clock);
    await sweepUntilQuiet(manager);
    await manager.alerts.sweep();

    // Asked about this Instance rather than farm-wide: this file leaves other work of its own open, so an
    // unfiltered inbox is a list about that too. Sweeping again must still leave exactly one notice each.
    for (const inbox of [
      await manager.alerts.mine({ entityId: instance.id }),
      await staff.alerts.mine({ entityId: instance.id }),
    ]) {
      expect(
        inbox.filter(
          (row) =>
            row.entityId === instance.id && row.kind === "instance_overdue"
        )
      ).toHaveLength(1);
    }

    // The Owner hears nothing yet: escalation is a separate rung.
    const owner = await as("owner", clock);
    expect(
      alertFor(
        await owner.alerts.mine({ entityId: instance.id }),
        instance.id,
        "instance_escalated"
      )
    ).toBeUndefined();
  });

  it("reaches the Owner once the escalation window has passed, and no further", async () => {
    const { instance, clock } = await workFor("2026-11-03", "23:05:00.000Z");
    const manager = await as("manager", clock);
    const owner = await as("owner", clock);

    // Overdue from 05:30, escalating two hours later at 07:30.
    clock.set(after("2026-11-03", 120));
    await sweepUntilQuiet(manager);
    expect(
      alertFor(
        await owner.alerts.mine({ entityId: instance.id }),
        instance.id,
        "instance_escalated"
      )
    ).toBeUndefined();

    clock.set(after("2026-11-03", 180));
    await sweepUntilQuiet(manager);
    const notice = alertFor(
      await owner.alerts.mine({ entityId: instance.id }),
      instance.id,
      "instance_escalated"
    );
    if (!notice) {
      throw new Error("expected an escalation notice");
    }

    // One rung: sweeping again, an hour later still, tells the Owner nothing new.
    clock.set(after("2026-11-03", 240));
    await sweepUntilQuiet(manager);
    const inbox = await owner.alerts.mine({ entityId: instance.id });
    expect(
      inbox.filter(
        (row) =>
          row.entityId === instance.id && row.kind === "instance_escalated"
      )
    ).toHaveLength(1);

    // Dismissing is the reader's own, and it stays dismissed through the next sweep.
    await owner.alerts.dismiss({ id: notice.id });
    await sweepUntilQuiet(manager);
    const cleared = await owner.alerts.mine({ entityId: instance.id });
    expect(cleared.some((row) => row.id === notice.id)).toBe(false);
  });

  it("takes the escalation window from the Farm Parameters", async () => {
    const setter = await createTestClient(appRouter, { as: "owner" });
    await setter.client.farm.setParameters({ escalationMinutes: 15 });
    try {
      const { instance, clock } = await workFor("2026-11-04", "23:05:00.000Z");
      // Overdue at 05:30 and now escalating at 05:45 rather than 07:30.
      clock.set(after("2026-11-04", 50));
      const manager = await as("manager", clock);
      await sweepUntilQuiet(manager);

      const owner = await as("owner", clock);
      expect(
        alertFor(
          await owner.alerts.mine({ entityId: instance.id }),
          instance.id,
          "instance_escalated"
        )
      ).toBeDefined();
    } finally {
      await setter.client.farm.setParameters({ escalationMinutes: 120 });
    }
  });

  it("stops being late the moment the work is finished, without anything having run", async () => {
    const { instance, clock } = await doneWork("2026-11-05");
    const manager = await as("manager", clock);

    clock.set(after("2026-11-05", 5 * 60));
    const late = await manager.instances.overdue();

    expect(late.some((row) => row.id === instance.id)).toBe(false);
  });
});

describe("sign-off", () => {
  it("puts finished work in the checker's queue and takes it out when approved", async () => {
    const { instance, clock } = await doneWork("2026-11-06");
    const manager = await as("manager", clock);

    const queued = await manager.instances.signOffQueue();
    expect(queued.some((row) => row.id === instance.id)).toBe(true);

    const approved = await manager.instances.approve({ id: instance.id });

    expect(approved.state).toBe("approved");
    const remaining = await manager.instances.signOffQueue();
    expect(remaining.some((row) => row.id === instance.id)).toBe(false);
  });

  it("sends it back with a reason, tells the doer, and lets them redo it", async () => {
    const { instance, clock, staff } = await doneWork("2026-11-07");
    const manager = await as("manager", clock);

    await manager.instances.sendBack({
      id: instance.id,
      reason: "শেডের কোণা বাকি আছে",
    });

    expect(
      alertFor(
        await staff.alerts.mine({ entityId: instance.id }),
        instance.id,
        "instance_sent_back"
      )
    ).toBeDefined();

    // Back on the doer's list, and recording the Step again corrects rather than duplicates.
    const mine = await staff.instances.today({ penId: world.pen.id });
    expect(mine.find((row) => row.id === instance.id)?.state).toBe("sent_back");

    await staff.instances.completeStep({
      instanceId: instance.id,
      stepId: "clean",
      evidence: [true],
    });
    await staff.instances.complete({ id: instance.id });
    const redone = await manager.instances.get({ id: instance.id });
    expect(redone.state).toBe("completed");
    expect(redone.completions).toHaveLength(1);
  });

  it("refuses a send-back with no reason, and sign-off by the person who did the work", async () => {
    const { instance, clock, staff } = await doneWork("2026-11-08");
    const manager = await as("manager", clock);

    await expect(
      manager.instances.sendBack({ id: instance.id, reason: "   " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // The doer cannot sign their own work off, whatever Roles they hold.
    await expect(
      staff.instances.approve({ id: instance.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("never queues work from an SOP nobody checks", async () => {
    const { instance, clock } = await workFor(
      "2026-11-09",
      "00:05:00.000Z",
      world.unchecked.definitionId
    );
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    await staff.instances.completeStep({
      instanceId: instance.id,
      stepId: "clean",
      evidence: [true],
    });
    await staff.instances.complete({ id: instance.id });

    const manager = await as("manager", clock);
    const queue = await manager.instances.signOffQueue();
    expect(queue.some((row) => row.id === instance.id)).toBe(false);
    await expect(
      manager.instances.approve({ id: instance.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("closing as missed", () => {
  it("keeps the Instance, needs a reason, and is not Staff's to do", async () => {
    const { instance, clock } = await workFor("2026-11-10", "23:05:00.000Z");
    clock.set(after("2026-11-10", 6 * 60));
    const staff = await as("staff", clock);
    const manager = await as("manager", clock);

    await expect(
      staff.instances.closeAsMissed({
        id: instance.id,
        reason: "লোক ছিল না",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.instances.closeAsMissed({ id: instance.id, reason: "" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const closed = await manager.instances.closeAsMissed({
      id: instance.id,
      reason: "লোক ছিল না",
    });

    expect(closed.state).toBe("missed");
    // Nothing disappears: it is off the Overdue list because it is no longer open, not
    // because it was removed.
    const kept = await manager.instances.get({ id: instance.id });
    expect(kept.state).toBe("missed");
    const late = await manager.instances.overdue();
    expect(late.some((row) => row.id === instance.id)).toBe(false);
  });

  it("refuses to close work that is already finished", async () => {
    const { instance, clock } = await doneWork("2026-11-11");
    const manager = await as("manager", clock);

    await expect(
      manager.instances.closeAsMissed({ id: instance.id, reason: "পরে" })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { state: "completed" },
    });
  });
});

describe("moves the work's state does not allow", () => {
  it("keeps work closed as Missed closed: no claim, no Step, no reassigning", async () => {
    const { instance, clock } = await workFor("2026-11-24", "23:05:00.000Z");
    clock.set(after("2026-11-24", 6 * 60));
    const manager = await as("manager", clock);
    await manager.instances.closeAsMissed({
      id: instance.id,
      reason: "লোক ছিল না",
    });

    const staff = await as("staff", clock);
    const closed = { code: "CONFLICT", data: { state: "missed", late: true } };
    await expect(
      staff.instances.claim({ id: instance.id })
    ).rejects.toMatchObject(closed);
    // A phone that did the cleaning anyway is told the work was closed, and nothing it said is written down.
    await expect(
      staff.instances.completeStep({
        instanceId: instance.id,
        stepId: "clean",
        evidence: [true],
      })
    ).rejects.toMatchObject(closed);
    await expect(
      manager.instances.assign({
        id: instance.id,
        userId: thePerson("staff").id,
      })
    ).rejects.toMatchObject(closed);
    const kept = await manager.instances.get({ id: instance.id });
    expect(kept).toMatchObject({ state: "missed", claimedBy: null });
    expect(kept.completions).toEqual([]);
  });

  it("tells the person holding work closed as Missed that it is closed, when their claim arrives again", async () => {
    const { instance, clock } = await workFor("2026-11-27", "23:05:00.000Z");
    const staff = await as("staff", clock);
    await staff.instances.claim({ id: instance.id });
    clock.set(after("2026-11-27", 6 * 60));
    const manager = await as("manager", clock);
    await manager.instances.closeAsMissed({
      id: instance.id,
      reason: "শেষ করা হয়নি",
    });
    const later = await as("staff", clock);
    await expect(
      later.instances.claim({ id: instance.id })
    ).rejects.toMatchObject({ code: "CONFLICT", data: { state: "missed" } });
  });

  it("keeps work sent back sent back when it is given to somebody else", async () => {
    const { instance, clock } = await doneWork("2026-11-25");
    const manager = await as("manager", clock);
    await manager.instances.sendBack({
      id: instance.id,
      reason: "কোণগুলো বাকি",
    });
    await manager.instances.assign({
      id: instance.id,
      userId: thePerson("staff").id,
    });
    const given = await manager.instances.get({ id: instance.id });
    expect(given).toMatchObject({
      state: "sent_back",
      assignedTo: thePerson("staff").id,
      claimedBy: null,
    });
  });

  it("lets one sign-off stand when an approval and a send-back arrive together", async () => {
    const { instance, clock } = await doneWork("2026-11-26");
    const manager = await as("manager", clock);
    const owner = await as("owner", clock);
    const both = await Promise.allSettled([
      manager.instances.approve({ id: instance.id }),
      owner.instances.sendBack({ id: instance.id, reason: "আবার দেখুন" }),
    ]);
    expect(both.filter((one) => one.status === "fulfilled")).toHaveLength(1);
    expect(both.find((one) => one.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
  });
});

describe("review findings", () => {
  it("tells whoever the work is for, not only the Manager, when nobody has claimed it", async () => {
    // Nobody claims it: the milking SOP is assigned to Staff, and the Staff member with
    // this Pen is the person who should be hearing that it is late.
    const { instance, clock } = await workFor("2026-11-13", "23:05:00.000Z");
    clock.set(after("2026-11-13", 45));
    const manager = await as("manager", clock);
    await sweepUntilQuiet(manager);

    const staff = await as("staff", clock);
    expect(
      alertFor(
        await staff.alerts.mine({ entityId: instance.id }),
        instance.id,
        "instance_overdue"
      )
    ).toBeDefined();
  });

  it("reaches the named checker whatever Role that is", async () => {
    const { instance, clock } = await workFor(
      "2026-11-14",
      "22:05:00.000Z",
      world.vetChecked.definitionId
    );
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    await vet.client.instances.claim({ id: instance.id });
    await vet.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "clean",
      evidence: [true],
    });
    await vet.client.instances.complete({ id: instance.id });

    // Checked by Staff, so the Staff member sees it — being Staff is not a reason to be
    // kept out of a queue the Version named them for.
    const staff = await as("staff", clock);
    const queue = await staff.instances.signOffQueue();
    expect(queue.some((row) => row.id === instance.id)).toBe(true);

    const approved = await staff.instances.approve({ id: instance.id });
    expect(approved.state).toBe("approved");
  });

  it("tells the person who recorded the work, even if nobody claimed it", async () => {
    const { instance, clock } = await workFor("2026-11-15", "23:05:00.000Z");
    const staff = await as("staff", clock);
    // Straight to recording: a Step can be done without anyone claiming the Instance first.
    await staff.instances.completeStep({
      instanceId: instance.id,
      stepId: "clean",
      evidence: [true],
    });
    await staff.instances.complete({ id: instance.id });

    const manager = await as("manager", clock);
    await manager.instances.sendBack({
      id: instance.id,
      reason: "আবার করুন",
    });

    expect(
      alertFor(
        await staff.alerts.mine({ entityId: instance.id }),
        instance.id,
        "instance_sent_back"
      )
    ).toBeDefined();
  });

  it("refuses to close work as missed before it is even late", async () => {
    const { instance, clock } = await workFor("2026-11-16", "23:05:00.000Z");
    const manager = await as("manager", clock);

    // Five minutes past due, still inside the half-hour of Grace.
    await expect(
      manager.instances.closeAsMissed({ id: instance.id, reason: "পরে" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    clock.set(after("2026-11-16", 45));
    const closed = await manager.instances.closeAsMissed({
      id: instance.id,
      reason: "লোক ছিল না",
    });
    expect(closed.state).toBe("missed");
    // Nobody completed it, so it carries no completion time.
    const kept = await manager.instances.get({ id: instance.id });
    expect(kept.completedAt).toBeNull();
  });

  it("picks up where the last sweep left off, rather than from the top", async () => {
    const early = await workFor("2026-11-18", "23:05:00.000Z");
    const manager = await as("manager", early.clock);
    early.clock.set(after("2026-11-18", 45));
    await sweepUntilQuiet(manager);
    expect(
      alertFor(
        await manager.alerts.mine({ entityId: early.instance.id }),
        early.instance.id,
        "instance_overdue"
      )
    ).toBeDefined();

    // Nobody opens the app for three days. Another day's work falls due and goes late in
    // the silence; the next sweep must reach it, not start from today.
    const later = await workFor("2026-11-21", "23:05:00.000Z");
    later.clock.set(after("2026-11-21", 45));
    const backAgain = await as("manager", later.clock);
    await sweepUntilQuiet(backAgain);

    expect(
      alertFor(
        await backAgain.alerts.mine({ entityId: later.instance.id }),
        later.instance.id,
        "instance_overdue"
      )
    ).toBeDefined();
  });

  it("still says something about work that went late while the farm was quiet", async () => {
    // Later than the sweep above: the watermark only ever moves forward, as a farm's own
    // clock does, so a test that rewound it would be testing something no farm can do.
    const { instance, clock } = await workFor("2026-11-22", "23:05:00.000Z");

    // Nobody opens the app for a fortnight. The work is still open, and still unsaid.
    clock.set(after("2026-11-22", 14 * 24 * 60));
    const manager = await as("manager", clock);
    await sweepUntilQuiet(manager);

    expect(
      alertFor(
        await manager.alerts.mine({ entityId: instance.id }),
        instance.id,
        "instance_overdue"
      )
    ).toBeDefined();
  });

  it("says something about work raised after the sweep had already passed its due time", async () => {
    // An SOP published mid-morning raises an Instance that was due at five and is already
    // late. It is new to the farm, however old its due time, and nobody has been told.
    const opener = await workFor("2026-12-08", "23:05:00.000Z");
    opener.clock.set(after("2026-12-08", 45));
    const manager = await as("manager", opener.clock);
    await sweepUntilQuiet(manager);

    const owner = await as("owner", opener.clock);
    const late = await owner.sops.create({
      content: sop({
        name: { bn: `দেরিতে প্রকাশিত ${suffix}` },
        triggers: [{ kind: "schedule", times: ["05:00"] }],
      }),
    });
    await owner.instances.ensureDue();
    const today = await owner.instances.today({ penId: world.pen.id });
    const raised = today.find((row) => row.definitionId === late.definitionId);
    if (!raised) {
      throw new Error("expected an instance from the newly published SOP");
    }
    expect(raised.overdue).toBe(true);

    await sweepUntilQuiet(manager);
    expect(
      alertFor(
        await manager.alerts.mine({ entityId: raised.id }),
        raised.id,
        "instance_overdue"
      )
    ).toBeDefined();
  });
});

describe("the trail", () => {
  it("records every transition with the Role it was done under", async () => {
    const { instance, clock } = await doneWork("2026-11-12");
    const manager = await as("manager", clock);
    await manager.instances.sendBack({
      id: instance.id,
      reason: "আবার করুন",
    });

    const trail = await manager.audit.list({
      entity: "sop_instance",
      entityId: instance.id,
    });
    const sentBack = trail.find(
      (row) => (row.after as { state?: string } | null)?.state === "sent_back"
    );
    expect(sentBack).toMatchObject({
      roleUsed: "manager",
      actorId: thePerson("manager").id,
      reason: "আবার করুন",
    });
    // And the doing of it, under the Role that did it.
    expect(
      trail.some(
        (row) =>
          row.roleUsed === "staff" && row.actorId === thePerson("staff").id
      )
    ).toBe(true);
  });
});

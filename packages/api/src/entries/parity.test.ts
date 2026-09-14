import { and, eq, inArray } from "@OpenFarm/db/operators";
import { user } from "@OpenFarm/db/schema/auth";
import { roleAssignment } from "@OpenFarm/db/schema/farm";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SyncKind } from "@OpenFarm/db/schema/sync";
import { SYNC_KINDS } from "@OpenFarm/db/schema/sync";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, HOUR, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildContext } from "../context";
import { appRouter } from "../routers/index";
import type { Entry } from "../sync-entries";
import { createTestClient } from "../test/client";

// An Entry is the same fact however it reaches the farm (ADR 0004). Each case records one of a pair
// through its procedure, with signal, and the other in a Batch that finds signal two hours later, and
// asks that the farm wrote the same record and the same Audit Event for both — dated when the work
// was done, under the same Role, refused for the same reason.

const suffix = `${Date.now()}`;
/** When the work was done. */
const DONE = "2033-07-01T04:00:00.000Z";
/** When the phone that did it offline found signal. */
const SENT = new Date(new Date(DONE).getTime() + 2 * HOUR).toISOString();
/** When the farm was set up for it: well before, so the work is the latest thing to have happened to
 *  anything this file compares. */
const SETUP = new Date(new Date(DONE).getTime() - 12 * HOUR).toISOString();

/** A minute after the work began, for each thing done after the one before: the trail orders what happened at one
 *  instant by nothing a test can rely on. */
const minutesIn = (minutes: number) =>
  new Date(new Date(DONE).getTime() + minutes * 60_000).toISOString();

/** The kinds this file holds to parity. A kind a phone can send and this file does not name is drift
 *  waiting to happen. */
const COVERED: readonly SyncKind[] = [
  "animal_move",
  "observation",
  "instance_claim",
  "step_completion",
  "completion_photo",
  "instance_complete",
];

const tickSop = (): SopContent => ({
  name: { bn: `পরীক্ষা ${suffix}`, en: "Parity" },
  purpose: { bn: "একই কাজ দুই পথে" },
  triggers: [],
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 24 * 60,
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

/** Somebody of this file's own, so the sequence numbers their phone sends are nobody else's. */
const person = async (
  id: string,
  roles: ("staff" | "vet")[],
  pens: string[]
) => {
  const db = scratchDb();
  const now = new Date(SETUP);
  await db
    .insert(user)
    .values({
      id,
      name: id,
      email: `${id}@test.openfarm`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(roleAssignment)
    .values(
      roles.map((role) => ({
        id: `role-${id}-${role}`,
        farmId: TEST_FARM.id,
        userId: id,
        role,
        createdAt: now,
      }))
    )
    .onConflictDoNothing();
  await db
    .insert(penAssignment)
    .values(
      pens.map((penId) => ({
        id: `pa-${id}-${penId}`,
        farmId: TEST_FARM.id,
        userId: id,
        penId,
      }))
    )
    .onConflictDoNothing();
  return id;
};

/** That person, from their own phone, at a moment. */
const calling = async (userId: string, at: string) => {
  const row = await scratchDb().query.user.findFirst({ where: { id: userId } });
  const borrowed = await scratchDb().query.session.findFirst({
    where: { userId: "test-staff" },
  });
  if (!(row && borrowed)) {
    throw new Error("seed failed");
  }
  const context = await buildContext({
    session: {
      user: row,
      session: { ...borrowed, userId, expiresAt: new Date("2099-01-01") },
    },
    clock: new FakeClock(at),
    db: scratchDb(),
  });
  return createRouterClient(appRouter, { context });
};

let nextSeq = 0;
/** One entry, sent on its own in a Batch that finds signal as long after the work as SENT is after DONE, as `userId`. */
const sendLater = async (
  userId: string,
  entry: Record<string, unknown> & { kind: SyncKind },
  doneAt = DONE
) => {
  nextSeq += 1;
  // Two hours after the work, whichever work it is.
  const phone = await calling(
    userId,
    new Date(
      new Date(doneAt).getTime() +
        (new Date(SENT).getTime() - new Date(DONE).getTime())
    ).toISOString()
  );
  const sent = await phone.sync.batch({
    key: `parity-${suffix}-${nextSeq}`,
    entries: [
      {
        id: `parity-entry-${suffix}-${nextSeq}`,
        seq: nextSeq,
        recordedAt: new Date(doneAt),
        ...entry,
      } as Entry,
    ],
  });
  const [result] = sent.results;
  return result;
};

/** Which row, and when the farm heard of it, differ between two twins by design. */
const TWIN_KEYS = new Set([
  "id",
  "animalId",
  "tagNumber",
  "instanceId",
  "completionId",
  "createdAt",
  "updatedAt",
  "receivedAt",
]);
const sameness = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sameness);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !TWIN_KEYS.has(key))
        .map(([key, inner]) => [key, sameness(inner)])
    );
  }
  return value;
};

/** The last Audit Event about a thing, as a comparison can read it: what happened and under which
 *  Role, not which row it was or when the farm heard. */
const lastEventAbout = async (entity: string, entityId: string) => {
  const row = await scratchDb().query.auditEvent.findFirst({
    where: { entity, entityId, farmId: TEST_FARM.id },
    orderBy: { receivedAt: "desc", id: "desc" },
  });
  return row
    ? {
        action: row.action,
        roleUsed: row.roleUsed,
        recordedAt: row.recordedAt.toISOString(),
        before: sameness(row.before),
        after: sameness(row.after),
      }
    : null;
};

/** The Move that took her to a Pen, as twins can be compared. */
const moveOf = async (animalId: string, toPenId: string) => {
  const row = await scratchDb().query.animalMove.findFirst({
    where: { animalId, toPenId },
  });
  return row
    ? {
        fromPenId: row.fromPenId,
        toPenId: row.toPenId,
        fromSide: row.fromSide,
        toSide: row.toSide,
        reason: row.reason,
        movedBy: row.movedBy,
        movedAt: row.movedAt.toISOString(),
      }
    : null;
};

/** What was seen of her, as twins can be compared. */
const observationOf = async (animalId: string) => {
  const row = await scratchDb().query.observation.findFirst({
    where: { animalId },
  });
  return row
    ? {
        saw: row.saw,
        sawLabel: row.sawLabel,
        note: row.note,
        seenBy: row.seenBy,
        seenAt: row.seenAt.toISOString(),
      }
    : null;
};

/** Where a piece of work stands, as twins can be compared. */
const instanceOf = async (id: string) => {
  const row = await scratchDb().query.sopInstance.findFirst({
    where: { id },
    columns: {
      state: true,
      claimedBy: true,
      claimedAt: true,
      completedAt: true,
    },
  });
  return row
    ? {
        state: row.state,
        claimedBy: row.claimedBy,
        claimedAt: row.claimedAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
      }
    : null;
};

/** The Step recorded on a piece of work: its row, and what twins share. */
const completionOf = async (instanceId: string) => {
  const row = await scratchDb().query.stepCompletion.findFirst({
    where: { instanceId },
  });
  return row
    ? {
        id: row.id,
        same: {
          stepId: row.stepId,
          status: row.status,
          evidence: row.evidence,
          skipReason: row.skipReason,
          outOfRange: row.outOfRange,
          destination: row.destination,
          recordedBy: row.recordedBy,
          recordedAt: row.recordedAt.toISOString(),
        },
      }
    : null;
};

/** The photographs against a Step Completion, as twins can be compared. */
const photosOf = (completionId: string) =>
  scratchDb().query.completionPhoto.findMany({
    where: { completionId },
    columns: { slot: true, contentType: true, data: true },
  });

const setup = async () => {
  await createTestClient(appRouter, { as: "staff" });
  const { client: owner } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(SETUP),
  });
  const shed = await owner.herd.createShed({ name: `parity-${suffix}` });
  const penA = await owner.herd.createPen({
    shedId: shed.id,
    name: `ক ${suffix}`,
  });
  const penB = await owner.herd.createPen({
    shedId: shed.id,
    name: `খ ${suffix}`,
  });
  const penC = await owner.herd.createPen({
    shedId: shed.id,
    name: `গ ${suffix}`,
  });

  const heifer = async (penId: string) => {
    const { tagNumber } = await owner.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId,
      source: "born",
      aliases: [],
    });
    const row = await scratchDb().query.animal.findFirst({
      where: { farmId: TEST_FARM.id, tagNumber },
      columns: { id: true },
    });
    return { tagNumber, id: row?.id ?? "" };
  };
  const pair = async (penId: string) =>
    [await heifer(penId), await heifer(penId)] as const;

  const staff = await person(
    `parity-staff-${suffix}`,
    ["staff"],
    [penA.id, penB.id]
  );
  const staffVet = await person(
    `parity-staff-vet-${suffix}`,
    ["staff", "vet"],
    [penA.id, penB.id]
  );

  const gone = await heifer(penA.id);
  await owner.animals.recordMortality({
    tagNumber: gone.tagNumber,
    kind: "died",
    cause: "পরীক্ষা",
    disposal: "buried",
    happenedAt: new Date(SETUP),
  });

  const sop = await owner.sops.create({ content: tickSop() });
  const { client: manager } = await createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock(SETUP),
  });
  const workIn = async (penId: string) => {
    await manager.instances.raiseNow({ definitionId: sop.definitionId, penId });
    const today = await manager.instances.today({ penId });
    return today.find((row) => row.definitionId === sop.definitionId)?.id ?? "";
  };

  return {
    pens: { a: penA.id, b: penB.id, c: penC.id },
    staff,
    staffVet,
    moved: await pair(penA.id),
    seen: await pair(penA.id),
    movedByStaffVet: await pair(penA.id),
    notTheirs: await heifer(penC.id),
    gone,
    work: [await workIn(penA.id), await workIn(penB.id)] as const,
    sop,
  };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  if (!world) {
    return;
  }
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.sop.definitionId));
  // Nothing this file raised is left open for a later file's clock to find late.
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.definitionId, world.sop.definitionId),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
});

describe("every kind a phone can send", () => {
  it("is held to parity here", () => {
    expect([...SYNC_KINDS].toSorted()).toEqual([...COVERED].toSorted());
  });
});

describe("a Move", () => {
  it("writes the same Move and the same Audit Event either way, dated when she was walked", async () => {
    const [online, offline] = world.moved;
    const now = await calling(world.staff, DONE);
    await now.animals.move({
      tagNumber: online.tagNumber,
      toPenId: world.pens.b,
    });
    const later = await sendLater(world.staff, {
      kind: "animal_move",
      tagNumber: offline.tagNumber,
      toPenId: world.pens.b,
    });

    expect(later?.outcome).toBe("applied");
    expect(await moveOf(offline.id, world.pens.b)).toEqual(
      await moveOf(online.id, world.pens.b)
    );
    expect(await lastEventAbout("animal", offline.id)).toEqual(
      await lastEventAbout("animal", online.id)
    );
  });

  it("is recorded under the same Role either way, for somebody who is Staff and a Vet", async () => {
    const [online, offline] = world.movedByStaffVet;
    const now = await calling(world.staffVet, DONE);
    await now.animals.move({
      tagNumber: online.tagNumber,
      toPenId: world.pens.b,
    });
    await sendLater(world.staffVet, {
      kind: "animal_move",
      tagNumber: offline.tagNumber,
      toPenId: world.pens.b,
    });

    const there = await lastEventAbout("animal", online.id);
    const here = await lastEventAbout("animal", offline.id);
    expect(here?.roleUsed).toBe(there?.roleUsed);
  });

  it("from a Pen that is not theirs is refused either way", async () => {
    const now = await calling(world.staffVet, DONE);
    await expect(
      now.animals.move({
        tagNumber: world.notTheirs.tagNumber,
        toPenId: world.pens.b,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const later = await sendLater(world.staffVet, {
      kind: "animal_move",
      tagNumber: world.notTheirs.tagNumber,
      toPenId: world.pens.b,
    });

    expect(later).toMatchObject({
      outcome: "rejected",
      refusal: { category: "not_yours" },
    });
    expect(await moveOf(world.notTheirs.id, world.pens.b)).toBeNull();
  });

  it("of an animal that has left the farm is late either way", async () => {
    const now = await calling(world.staff, DONE);
    await expect(
      now.animals.move({
        tagNumber: world.gone.tagNumber,
        toPenId: world.pens.b,
      })
    ).rejects.toMatchObject({ data: { late: true } });
    const later = await sendLater(world.staff, {
      kind: "animal_move",
      tagNumber: world.gone.tagNumber,
      toPenId: world.pens.b,
    });

    expect(later).toMatchObject({
      outcome: "kept",
      refusal: { category: "late" },
    });
  });
});

describe("an Observation", () => {
  it("writes the same Observation and the same Audit Event either way, dated when she was seen", async () => {
    const [online, offline] = world.seen;
    const now = await calling(world.staff, DONE);
    const recorded = await now.observations.record({
      tagNumber: online.tagNumber,
      saw: "lame",
    });
    const later = await sendLater(world.staff, {
      kind: "observation",
      tagNumber: offline.tagNumber,
      saw: "lame",
    });
    const kept = await scratchDb().query.observation.findFirst({
      where: { animalId: offline.id },
      columns: { id: true },
    });

    expect(later?.outcome).toBe("applied");
    expect(await observationOf(offline.id)).toEqual(
      await observationOf(online.id)
    );
    expect(await lastEventAbout("observation", kept?.id ?? "")).toEqual(
      await lastEventAbout("observation", recorded.id)
    );
  });

  it("of an animal that has left the farm is late either way", async () => {
    const now = await calling(world.staff, DONE);
    await expect(
      now.observations.record({ tagNumber: world.gone.tagNumber, saw: "lame" })
    ).rejects.toMatchObject({ data: { late: true } });
    const later = await sendLater(world.staff, {
      kind: "observation",
      tagNumber: world.gone.tagNumber,
      saw: "lame",
    });

    expect(later).toMatchObject({
      outcome: "kept",
      refusal: { category: "late" },
    });
  });
});

describe("a piece of work", () => {
  // One story, in the order it happens in the shed: claimed, its Step done, finished.
  it("is claimed the same way either way, dated when it was taken", async () => {
    const [online, offline] = world.work;
    const now = await calling(world.staff, DONE);
    await now.instances.claim({ id: online });
    const later = await sendLater(world.staff, {
      kind: "instance_claim",
      instanceId: offline,
    });

    expect(later?.outcome).toBe("applied");
    expect(await instanceOf(offline)).toEqual(await instanceOf(online));
    expect(await lastEventAbout("sop_instance", offline)).toEqual(
      await lastEventAbout("sop_instance", online)
    );
  });

  it("has its Step recorded the same way either way", async () => {
    const [online, offline] = world.work;
    const now = await calling(world.staff, minutesIn(1));
    await now.instances.completeStep({
      instanceId: online,
      stepId: "look",
      evidence: [true],
    });
    const later = await sendLater(
      world.staff,
      {
        kind: "step_completion",
        instanceId: offline,
        stepId: "look",
        evidence: [true],
      },
      minutesIn(1)
    );
    const there = await completionOf(online);
    const here = await completionOf(offline);

    expect(later?.outcome).toBe("applied");
    expect(here?.same).toEqual(there?.same);
    expect(await lastEventAbout("step_completion", here?.id ?? "")).toEqual(
      await lastEventAbout("step_completion", there?.id ?? "")
    );
  });

  it("has a photograph put against its Step the same way either way", async () => {
    const [online, offline] = world.work;
    const there = await completionOf(online);
    const here = await completionOf(offline);
    const picture = {
      slot: 0,
      contentType: "image/jpeg" as const,
      data: "AAAA",
    };
    const now = await calling(world.staff, minutesIn(2));
    await now.instances.attachPhoto({
      completionId: there?.id ?? "",
      ...picture,
    });
    const later = await sendLater(
      world.staff,
      { kind: "completion_photo", completionId: here?.id ?? "", ...picture },
      minutesIn(2)
    );

    expect(later?.outcome).toBe("applied");
    expect(await photosOf(here?.id ?? "")).toEqual(
      await photosOf(there?.id ?? "")
    );
    expect(await lastEventAbout("step_completion", here?.id ?? "")).toEqual(
      await lastEventAbout("step_completion", there?.id ?? "")
    );
  });

  it("is finished the same way either way, dated when it was finished", async () => {
    const [online, offline] = world.work;
    const now = await calling(world.staff, minutesIn(3));
    await now.instances.complete({ id: online });
    const later = await sendLater(
      world.staff,
      { kind: "instance_complete", instanceId: offline },
      minutesIn(3)
    );

    expect(later?.outcome).toBe("applied");
    expect(await instanceOf(offline)).toEqual(await instanceOf(online));
    expect(await lastEventAbout("sop_instance", offline)).toEqual(
      await lastEventAbout("sop_instance", online)
    );
  });
});

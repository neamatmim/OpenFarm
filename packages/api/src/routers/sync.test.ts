import { eq } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { syncEntry } from "@OpenFarm/db/schema/sync";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, HOUR, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const suffix = `${Date.now()}`;

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
      skipReasons: [{ bn: "অসুস্থ" }],
      effect: { kind: "milk_record" },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({ name: `sync-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  const spare = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `খালি ${suffix}`,
  });

  const milkingCow = async () => {
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
    return cow;
  };
  const cows = [await milkingCow(), await milkingCow()];

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values(
      [pen.id, spare.id].map((penId) => ({
        id: `pa-sync-${penId}`,
        farmId: TEST_FARM.id,
        userId: "test-staff",
        penId,
      }))
    )
    .onConflictDoNothing();

  const sop = await owner.client.sops.create({ content: milkingSop() });
  return { owner, pen, spare, cows, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

let nextSeq = 0;
const seq = () => {
  nextSeq += 1;
  return nextSeq;
};
let nextKey = 0;
const nextName = () => {
  nextKey += 1;
  return `${suffix}-${nextKey}`;
};
const key = () => `batch-${nextName()}`;
const recordId = () => `rec-${nextName()}`;

/** A claimed Instance of the milking SOP on its own day. */
const session = async (day: string) => {
  const clock = new FakeClock(`${day}T05:30:00.000Z`);
  const scheduler = await createTestClient(appRouter, { as: "owner", clock });
  await scheduler.client.instances.ensureDue();
  const today = await scheduler.client.instances.today({ penId: world.pen.id });
  const instance = today.find(
    (candidate) => candidate.definitionId === world.sop.definitionId
  );
  if (!instance) {
    throw new Error(`expected an instance on ${day}`);
  }
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  await staff.client.instances.claim({ id: instance.id });
  return { instance, clock, staff: staff.client };
};

const milkEntry = (
  instanceId: string,
  tagNumber: string,
  litres: number,
  at: Date
) => ({
  id: recordId(),
  seq: seq(),
  kind: "step_completion" as const,
  instanceId,
  stepId: "milk",
  animalTag: tagNumber,
  evidence: [litres],
  recordedAt: at,
});

const tagOf = (index: number) => world.cows[index]?.tagNumber ?? "";

describe("a batch arriving", () => {
  it("writes every entry and its Audit Events in one go", async () => {
    const { instance, clock, staff } = await session("2027-01-01");
    const at = clock.now();

    const sent = await staff.sync.batch({
      key: key(),
      entries: [
        milkEntry(instance.id, tagOf(0), 11, at),
        milkEntry(instance.id, tagOf(1), 9, at),
      ],
    });

    expect(sent.results.map((row) => row.outcome)).toEqual([
      "applied",
      "applied",
    ]);
    const loaded = await staff.milk.session({ instanceId: instance.id });
    expect(loaded.records).toHaveLength(2);
    // The record carries the client's own id, so a replay is the same fact.
    const board = await staff.instances.get({ id: instance.id });
    expect(board.completions.map((row) => row.id).toSorted()).toEqual(
      sent.results.map((row) => row.id).toSorted()
    );
  });

  it("applies whole or not at all", async () => {
    const { instance, clock, staff } = await session("2027-01-02");
    const at = clock.now();
    const good = milkEntry(instance.id, tagOf(0), 11, at);
    // A Step this Version has never heard of: the whole entry is malformed, not the batch.
    const bad = {
      ...milkEntry(instance.id, tagOf(1), 9, at),
      stepId: "no-such-step",
    };

    const sent = await staff.sync.batch({
      key: key(),
      entries: [good, bad],
    });

    // One refused on its own account; the other stands. A batch is not an all-or-nothing
    // hostage to its worst entry — it is one transaction, and a refusal is not a failure.
    expect(sent.results.map((row) => row.outcome)).toEqual([
      "applied",
      "rejected",
    ]);
    expect(sent.results[1]?.reason).toContain("no-such-step");
    const loaded = await staff.milk.session({ instanceId: instance.id });
    expect(loaded.records).toHaveLength(1);
  });

  it("answers a replay from what it stored, and writes nothing again", async () => {
    const { instance, clock, staff } = await session("2027-01-03");
    const at = clock.now();
    const batchKey = key();
    const entries = [milkEntry(instance.id, tagOf(0), 11, at)];

    const first = await staff.sync.batch({ key: batchKey, entries });
    const second = await staff.sync.batch({ key: batchKey, entries });

    expect(second).toEqual(first);
    const loaded = await staff.milk.session({ instanceId: instance.id });
    expect(loaded.records).toHaveLength(1);
  });

  it("refuses the same key carrying different work", async () => {
    const { instance, clock, staff } = await session("2027-01-04");
    const at = clock.now();
    const batchKey = key();
    await staff.sync.batch({
      key: batchKey,
      entries: [milkEntry(instance.id, tagOf(0), 11, at)],
    });

    await expect(
      staff.sync.batch({
        key: batchKey,
        entries: [milkEntry(instance.id, tagOf(1), 9, at)],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("treats the same record id in a later batch as already recorded", async () => {
    const { instance, clock, staff } = await session("2027-01-05");
    const at = clock.now();
    const entry = milkEntry(instance.id, tagOf(0), 11, at);
    await staff.sync.batch({ key: key(), entries: [entry] });

    // A phone that lost the reply and re-queued the entry under a new batch.
    const again = await staff.sync.batch({
      key: key(),
      entries: [{ ...entry, seq: seq() }],
    });

    expect(again.results[0]).toMatchObject({ reason: "already recorded" });
    const loaded = await staff.milk.session({ instanceId: instance.id });
    expect(loaded.records).toHaveLength(1);
  });

  it("stores both clocks, and the phone cannot set the server's", async () => {
    const { instance, clock, staff } = await session("2027-01-06");
    const drawnAt = new Date(clock.now().getTime() - 3 * HOUR);

    await staff.sync.batch({
      key: key(),
      entries: [milkEntry(instance.id, tagOf(0), 11, drawnAt)],
    });

    const board = await staff.instances.get({ id: instance.id });
    const [completion] = board.completions;
    expect(completion?.recordedAt).toEqual(drawnAt);
    expect(completion?.receivedAt).toEqual(clock.now());
  });
});

describe("what the farm makes of it", () => {
  it("keeps a late entry the world has moved past, whole, rather than losing it", async () => {
    const { instance, clock, staff } = await session("2027-01-07");
    const at = clock.now();
    await staff.sync.batch({
      key: key(),
      entries: [milkEntry(instance.id, tagOf(0), 11, at)],
    });

    // The phone was out of signal and is sending a different figure for a cow already
    // recorded. It is a fact somebody wrote down; it is kept and put in front of a person.
    const sent = await staff.sync.batch({
      key: key(),
      entries: [milkEntry(instance.id, tagOf(0), 7, at)],
    });

    expect(sent.results[0]).toMatchObject({ outcome: "kept" });
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const queue = await manager.client.review.open();
    expect(queue.some((row) => row.entityId === sent.results[0]?.id)).toBe(
      true
    );

    // The figure the milker wrote down is held whole. It is not in the records — the cow is
    // already recorded, and nothing overwrites a recorded fact — but it is not lost either:
    // whoever looks at the queue can see exactly what was meant.
    const [held] = await scratchDb()
      .select()
      .from(syncEntry)
      .where(eq(syncEntry.id, sent.results[0]?.id ?? ""));
    expect((held?.payload as { evidence?: unknown[] })?.evidence).toEqual([7]);
    expect(held?.reason).toContain("already recorded");
    // And the cow's own record is untouched.
    const loaded = await staff.milk.session({ instanceId: instance.id });
    expect(loaded.records[0]?.litres).toBe("11.00");
  });

  it("says so when a phone's sequence has skipped numbers", async () => {
    const { instance, clock, staff } = await session("2027-01-08");
    const at = clock.now();
    await staff.sync.batch({
      key: key(),
      entries: [milkEntry(instance.id, tagOf(0), 11, at)],
    });
    const skippedOver = [seq(), seq()];

    // Two entries the farm will never read: still in an outbox, or gone with the phone.
    const sent = await staff.sync.batch({
      key: key(),
      entries: [milkEntry(instance.id, tagOf(1), 9, at)],
    });

    expect(sent.results[0]?.outcome).toBe("applied");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const queue = await manager.client.review.open();
    const gap = queue.find((row) => row.reason === "sync_gap");
    expect(gap).toBeDefined();
    void skippedOver;
  });

  it("flags a phone whose clock is far out, and keeps the entry", async () => {
    const { instance, clock, staff } = await session("2027-01-09");
    const at = clock.now();
    // A phone whose clock is a day fast, saying so as it sends. The litres are still the
    // litres — what is wrong is the phone, not the milking.
    const sent = await staff.sync.batch({
      key: key(),
      sentAt: new Date(at.getTime() + 24 * HOUR),
      entries: [milkEntry(instance.id, tagOf(0), 11, at)],
    });

    expect(sent.results[0]?.outcome).toBe("flagged");
    const loaded = await staff.milk.session({ instanceId: instance.id });
    expect(loaded.records).toHaveLength(1);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const queue = await manager.client.review.open();
    expect(queue.some((row) => row.reason === "clock_skew")).toBe(true);
  });

  it("refuses an entry about an animal the farm has never heard of, on its own", async () => {
    const { instance, clock, staff } = await session("2027-01-10");
    const at = clock.now();

    const sent = await staff.sync.batch({
      key: key(),
      entries: [
        milkEntry(instance.id, "D-9999", 11, at),
        milkEntry(instance.id, tagOf(0), 12, at),
      ],
    });

    // A tag the farm has never had is not a changed world; it is a wrong entry, and the
    // phone keeps it so somebody can see what was meant. The rest of the batch stands.
    expect(sent.results[0]?.outcome).toBe("rejected");
    expect(sent.results[0]?.reason).toContain("D-9999");
    expect(sent.results[1]?.outcome).toBe("applied");
  });

  it("keeps an entry for a cow that has left the farm since it was written", async () => {
    const { instance, clock, staff } = await session("2027-01-14");
    const at = clock.now();
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const doomed = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.pen.id,
      source: "born",
      aliases: [],
    });
    const walk = (state: "pregnant_heifer" | "milking") =>
      owner.client.animals.setState({
        tagNumber: doomed.tagNumber,
        state,
        reason: "test",
      });
    await walk("pregnant_heifer");
    await walk("milking");
    // She leaves by the record of how she went, which for a sale is a buyer and a lorry.
    const seller = await createTestClient(appRouter, {
      as: "manager",
      clock,
    });
    await seller.client.sale.record({
      tagNumber: doomed.tagNumber,
      buyer: { name: `বাজার ${Date.now()}` },
      priceBdt: 90_000,
      weightKg: 260,
      destination: "হাট",
      vehicle: "ট ১১-২২৩৩",
      driver: "সোহেল",
    });

    // The milker recorded her before she went; the phone is only now in signal.
    const sent = await staff.sync.batch({
      key: key(),
      entries: [milkEntry(instance.id, doomed.tagNumber, 8, at)],
    });

    expect(sent.results[0]?.outcome).toBe("kept");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const queue = await manager.client.review.open();
    expect(queue.some((row) => row.reason === "late_entry")).toBe(true);

    const [held] = await scratchDb()
      .select()
      .from(syncEntry)
      .where(eq(syncEntry.id, sent.results[0]?.id ?? ""));
    expect((held?.payload as { evidence?: unknown[] })?.evidence).toEqual([8]);
  });

  it("records what somebody saw with no signal, as seen when they wrote it down", async () => {
    const { clock, staff } = await session("2027-01-11");
    const sawAt = new Date(clock.now().getTime() - 40 * 60_000);

    const sent = await staff.sync.batch({
      key: key(),
      entries: [
        {
          id: recordId(),
          seq: seq(),
          kind: "observation" as const,
          tagNumber: tagOf(0),
          saw: "lame",
          note: "পেছনের বাঁ পা",
          recordedAt: sawAt,
        },
      ],
    });

    expect(sent.results[0]).toMatchObject({ outcome: "applied" });
    const her = await staff.animals.byTag({ tagNumber: tagOf(0) });
    expect(her.observations).toContainEqual(
      expect.objectContaining({
        saw: "lame",
        note: "পেছনের বাঁ পা",
        instanceId: null,
        seenAt: sawAt,
      })
    );
  });
});

describe("review findings", () => {
  it("a replay does not put a second person's name on the first person's work", async () => {
    const { instance, clock, staff } = await session("2027-01-15");
    const at = clock.now();
    const entry = milkEntry(instance.id, tagOf(0), 11, at);
    await staff.sync.batch({ key: key(), entries: [entry] });

    // The same person's shed phone sends the same figures under its own record id. The
    // work was done on their own phone, and the record has to keep saying so — an upsert
    // here would quietly restamp it with the shed phone's name.
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
    });
    const again = await phone.client.sync.batch({
      key: key(),
      entries: [{ ...entry, id: recordId(), seq: seq() }],
    });

    expect(again.results[0]?.outcome).toBe("applied");
    const board = await staff.instances.get({ id: instance.id });
    expect(board.completions).toHaveLength(1);
    expect(board.completions[0]).toMatchObject({
      recordedBy: "test-staff",
      deviceId: null,
    });
  });

  it("says which numbers are missing inside the batch, not only before it", async () => {
    const { instance, clock, staff } = await session("2027-01-16");
    const at = clock.now();
    const first = seq();
    const gap = seq();
    const third = seq();

    // The phone sends 1 and 3 of a run: 2 is somewhere the farm cannot read it.
    const sent = await staff.sync.batch({
      key: key(),
      entries: [
        { ...milkEntry(instance.id, tagOf(0), 11, at), seq: first },
        { ...milkEntry(instance.id, tagOf(1), 9, at), seq: third },
      ],
    });

    expect(sent.results.every((row) => row.outcome === "applied")).toBe(true);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const queue = await manager.client.review.open();
    const notice = queue.find((row) => row.reason === "sync_gap");
    expect(notice).toBeDefined();
    void gap;
  });

  it("refuses a second entry under a sequence number already used", async () => {
    const { instance, clock, staff } = await session("2027-01-17");
    const at = clock.now();
    const used = seq();
    await staff.sync.batch({
      key: key(),
      entries: [{ ...milkEntry(instance.id, tagOf(0), 11, at), seq: used }],
    });

    const sent = await staff.sync.batch({
      key: key(),
      entries: [{ ...milkEntry(instance.id, tagOf(1), 9, at), seq: used }],
    });

    // Two different entries under one number: the phone's own count is wrong, and taking
    // the second would leave the farm unable to say which is which.
    expect(sent.results[0]).toMatchObject({ outcome: "rejected" });
    expect(sent.results[0]?.reason).toContain("already used");
  });

  it("leaves nothing behind when an entry fails halfway through", async () => {
    const { instance, clock, staff } = await session("2027-01-18");
    const at = clock.now();
    // A Step whose effect writes a Milk Record, with no figure to write: the Completion row
    // goes in before the effect runs, and the effect is what refuses. Neither may survive.
    const broken = {
      ...milkEntry(instance.id, tagOf(0), 11, at),
      evidence: [] as (boolean | number | string)[],
    };

    const sent = await staff.sync.batch({
      key: key(),
      entries: [broken, milkEntry(instance.id, tagOf(1), 9, at)],
    });

    expect(sent.results[0]?.outcome).toBe("rejected");
    expect(sent.results[1]?.outcome).toBe("applied");
    const board = await staff.instances.get({ id: instance.id });
    // Only the good one: the half-written row rolled back with its own savepoint.
    expect(board.completions).toHaveLength(1);
    const loaded = await staff.milk.session({ instanceId: instance.id });
    expect(loaded.records).toHaveLength(1);
  });

  it("one notice about a phone whose clock is out, not one per entry", async () => {
    const { instance, clock, staff } = await session("2027-01-19");
    const at = clock.now();
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const before = await manager.client.review.open();

    await staff.sync.batch({
      key: key(),
      sentAt: new Date(at.getTime() + 24 * HOUR),
      entries: [
        milkEntry(instance.id, tagOf(0), 11, at),
        milkEntry(instance.id, tagOf(1), 9, at),
      ],
    });

    const after = await manager.client.review.open();
    const raised = after.filter(
      (row) =>
        row.reason === "clock_skew" &&
        !before.some((earlier) => earlier.id === row.id)
    );
    expect(raised).toHaveLength(1);
  });
});

describe("a phone that was out of signal all morning", () => {
  it("claims, milks and finishes in one send, exactly as it happened in the shed", async () => {
    // Raised, but nobody has touched it: this is a shed with no signal from the start.
    const clock = new FakeClock("2027-01-22T05:30:00.000Z");
    const scheduler = await createTestClient(appRouter, {
      as: "owner",
      clock,
    });
    await scheduler.client.instances.ensureDue();
    const today = await scheduler.client.instances.today({
      penId: world.pen.id,
    });
    const instance = today.find(
      (row) => row.definitionId === world.sop.definitionId
    );
    if (!instance) {
      throw new Error("expected an instance");
    }
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const drawnAt = new Date(clock.now().getTime() - 2 * HOUR);

    const sent = await staff.client.sync.batch({
      key: key(),
      sentAt: clock.now(),
      entries: [
        {
          id: recordId(),
          seq: seq(),
          kind: "instance_claim" as const,
          instanceId: instance.id,
          recordedAt: drawnAt,
        },
        milkEntry(instance.id, tagOf(0), 12.5, drawnAt),
        milkEntry(instance.id, tagOf(1), 9.5, drawnAt),
        {
          id: recordId(),
          seq: seq(),
          kind: "instance_complete" as const,
          instanceId: instance.id,
          recordedAt: drawnAt,
        },
      ],
    });

    expect(sent.results.map((row) => row.outcome)).toEqual([
      "applied",
      "applied",
      "applied",
      "applied",
    ]);
    // The farm is where the phone was: the shift is claimed by the milker, both cows are
    // recorded, and the work is finished and waiting for sign-off.
    const board = await staff.client.instances.get({ id: instance.id });
    expect(board).toMatchObject({
      state: "completed",
      claimedBy: "test-staff",
    });
    const milked = await staff.client.milk.session({
      instanceId: instance.id,
    });
    expect(milked.records).toHaveLength(2);
  });

  it("keeps a whole shift when somebody else took the work first", async () => {
    const clock = new FakeClock("2027-01-23T05:30:00.000Z");
    const scheduler = await createTestClient(appRouter, {
      as: "owner",
      clock,
    });
    await scheduler.client.instances.ensureDue();
    const today = await scheduler.client.instances.today({
      penId: world.pen.id,
    });
    const instance = today.find(
      (row) => row.definitionId === world.sop.definitionId
    );
    if (!instance) {
      throw new Error("expected an instance");
    }
    // The Manager took it while the milker's phone was out of range.
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await manager.client.instances.claim({ id: instance.id });

    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const sent = await staff.client.sync.batch({
      key: key(),
      sentAt: clock.now(),
      entries: [
        {
          id: recordId(),
          seq: seq(),
          kind: "instance_claim" as const,
          instanceId: instance.id,
          recordedAt: clock.now(),
        },
        milkEntry(instance.id, tagOf(0), 12.5, clock.now()),
      ],
    });

    // Neither is refused: the milker did the work, and the world moved while they were in
    // the shed. Both are held for somebody to decide.
    expect(sent.results.map((row) => row.outcome)).toEqual(["kept", "kept"]);
    const queue = await manager.client.review.open();
    expect(
      sent.results.every((row) =>
        queue.some((held) => held.entityId === row.id)
      )
    ).toBe(true);
  });

  it("writes no trail entry for a finish that changed nothing", async () => {
    const { instance, clock, staff } = await session("2027-01-24");
    const at = clock.now();
    await staff.sync.batch({
      key: key(),
      entries: [
        milkEntry(instance.id, tagOf(0), 11, at),
        milkEntry(instance.id, tagOf(1), 9, at),
        {
          id: recordId(),
          seq: seq(),
          kind: "instance_complete" as const,
          instanceId: instance.id,
          recordedAt: at,
        },
      ],
    });
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const before = await manager.client.audit.list({
      entity: "sop_instance",
      entityId: instance.id,
    });

    // The phone sends the finish again — a replayed outbox, under a new record id.
    const again = await staff.sync.batch({
      key: key(),
      entries: [
        {
          id: recordId(),
          seq: seq(),
          kind: "instance_complete" as const,
          instanceId: instance.id,
          recordedAt: at,
        },
      ],
    });

    expect(again.results[0]?.outcome).toBe("applied");
    const after = await manager.client.audit.list({
      entity: "sop_instance",
      entityId: instance.id,
    });
    // Nothing happened, so the trail says nothing happened. An Audit Event claiming a
    // transition that did not occur is a trail that lies.
    expect(after).toHaveLength(before.length);
  });

  it("is not a phone with a wrong clock", async () => {
    const { instance, clock, staff } = await session("2027-01-21");
    const now = clock.now();
    // Recorded at five, sent at nine: four hours old, and entirely ordinary. A farm that
    // flagged this would flag every entry an outbox ever held.
    const sent = await staff.sync.batch({
      key: key(),
      sentAt: now,
      entries: [
        milkEntry(
          instance.id,
          tagOf(0),
          11,
          new Date(now.getTime() - 4 * HOUR)
        ),
      ],
    });

    expect(sent.results[0]?.outcome).toBe("applied");
  });

  it("sends the whole milking in order, and the farm ends up where the phone was", async () => {
    const { instance, clock, staff } = await session("2027-01-20");
    const drawnAt = new Date(clock.now().getTime() - 2 * HOUR);

    // Everything the milker recorded in the shed, in the order they recorded it, arriving
    // in one send once the phone is back in range. This is what the client Outbox holds.
    const sent = await staff.sync.batch({
      key: key(),
      entries: [
        milkEntry(instance.id, tagOf(0), 12.5, drawnAt),
        milkEntry(instance.id, tagOf(1), 9.5, drawnAt),
      ],
    });

    expect(sent.results.map((row) => row.outcome)).toEqual([
      "applied",
      "applied",
    ]);
    // The farm's records now say what the phone said: both cows, their litres, the time
    // they were actually milked, and the tank they went to.
    const milked = await staff.milk.session({ instanceId: instance.id });
    expect(
      milked.records.map((row) => [row.animal.tagNumber, row.litres]).toSorted()
    ).toEqual(
      [
        [tagOf(0), "12.50"],
        [tagOf(1), "9.50"],
      ].toSorted()
    );
    expect(milked.records.every((row) => row.destination === "bulk")).toBe(
      true
    );
    const board = await staff.instances.get({ id: instance.id });
    expect(
      board.completions.every(
        (row) => row.recordedAt.getTime() === drawnAt.getTime()
      )
    ).toBe(true);
    expect(board.state).toBe("in_progress");
  });
});

describe("photos", () => {
  it("arrive as their own entries, against the slot they answer", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const withPhotos = await owner.client.sops.create({
      content: {
        ...milkingSop(),
        name: { bn: `ছবি এসওপি ${suffix}` },
        triggers: [{ kind: "schedule", times: ["03:00"] }],
        steps: [
          {
            id: "check",
            text: { bn: "পরীক্ষা" },
            repeatPerAnimal: false,
            evidence: [
              { type: "photo", required: true },
              { type: "photo", required: true },
            ],
            skipReasons: [],
          },
        ],
      },
    });
    const clock = new FakeClock("2027-01-25T05:30:00.000Z");
    const scheduler = await createTestClient(appRouter, {
      as: "owner",
      clock,
    });
    await scheduler.client.instances.ensureDue();
    const today = await scheduler.client.instances.today({
      penId: world.pen.id,
    });
    const instance = today.find(
      (row) => row.definitionId === withPhotos.definitionId
    );
    if (!instance) {
      throw new Error("expected an instance");
    }
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const completionId = recordId();

    // The figures go first, saying which slots have pictures coming; the pictures follow as
    // entries of their own, so a megabyte of image cannot hold up a morning's litres.
    const sent = await staff.client.sync.batch({
      key: key(),
      entries: [
        {
          id: completionId,
          seq: seq(),
          kind: "step_completion" as const,
          instanceId: instance.id,
          stepId: "check",
          evidence: [],
          photoSlots: [0, 1],
          recordedAt: clock.now(),
        },
        {
          id: recordId(),
          seq: seq(),
          kind: "completion_photo" as const,
          completionId,
          slot: 0,
          contentType: "image/jpeg" as const,
          data: "AAAA",
          recordedAt: clock.now(),
        },
        {
          id: recordId(),
          seq: seq(),
          kind: "completion_photo" as const,
          completionId,
          slot: 1,
          contentType: "image/jpeg" as const,
          data: "BBBB",
          recordedAt: clock.now(),
        },
      ],
    });

    expect(sent.results.map((row) => row.outcome)).toEqual([
      "applied",
      "applied",
      "applied",
    ]);
    const board = await staff.client.instances.get({ id: instance.id });
    expect(board.completions).toHaveLength(1);
  });

  it("keeps a picture whose entry never arrived, rather than losing it", async () => {
    const { clock, staff } = await session("2027-01-26");

    const sent = await staff.sync.batch({
      key: key(),
      entries: [
        {
          id: recordId(),
          seq: seq(),
          kind: "completion_photo" as const,
          completionId: "no-such-completion",
          slot: 0,
          contentType: "image/jpeg" as const,
          data: "AAAA",
          recordedAt: clock.now(),
        },
      ],
    });

    // Early, or orphaned. Either way it is a picture somebody took in a shed.
    expect(sent.results[0]?.outcome).toBe("kept");
  });
});

describe("who is sending", () => {
  it("refuses the whole batch when the session has expired, with nothing written", async () => {
    const { instance, clock } = await session("2027-01-12");
    const at = clock.now();
    const stale = await createTestClient(appRouter, { as: "staff", clock });
    const entries = [milkEntry(instance.id, tagOf(0), 11, at)];

    // A month later the session is long gone. The phone must pause and sign in again
    // rather than have its outbox half-applied.
    clock.set(new Date(at.getTime() + 40 * 24 * HOUR));
    await expect(
      stale.client.sync.batch({ key: key(), entries })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const rows = await scratchDb()
      .select()
      .from(syncEntry)
      .where(eq(syncEntry.id, entries[0]?.id ?? ""));
    expect(rows).toEqual([]);
  });

  it("records a shed phone's batch against the person PIN-switched in", async () => {
    const { instance, clock } = await session("2027-01-13");
    const at = clock.now();
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
    });

    await phone.client.sync.batch({
      key: key(),
      entries: [milkEntry(instance.id, tagOf(0), 11, at)],
    });

    const board = await phone.client.instances.get({ id: instance.id });
    expect(board.completions[0]).toMatchObject({
      recordedBy: "test-staff",
      deviceId: "test-shed-phone",
    });
  });
});

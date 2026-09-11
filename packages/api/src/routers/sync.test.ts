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
  it("keeps a late entry the world has moved past, flagged rather than lost", async () => {
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

    expect(sent.results[0]).toMatchObject({ outcome: "flagged" });
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const queue = await manager.client.review.open();
    expect(queue.some((row) => row.entityId === sent.results[0]?.id)).toBe(
      true
    );
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
    // A phone whose clock is a day fast. The litres are still the litres.
    const wrongClock = new Date(clock.now().getTime() + 24 * HOUR);

    const sent = await staff.sync.batch({
      key: key(),
      entries: [milkEntry(instance.id, tagOf(0), 11, wrongClock)],
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
    const walk = (state: "pregnant_heifer" | "milking" | "sold") =>
      owner.client.animals.setState({
        tagNumber: doomed.tagNumber,
        state,
        reason: "test",
      });
    await walk("pregnant_heifer");
    await walk("milking");
    await walk("sold");

    // The milker recorded her before she went; the phone is only now in signal.
    const sent = await staff.sync.batch({
      key: key(),
      entries: [milkEntry(instance.id, doomed.tagNumber, 8, at)],
    });

    expect(sent.results[0]?.outcome).toBe("flagged");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const queue = await manager.client.review.open();
    expect(queue.some((row) => row.reason === "late_entry")).toBe(true);
  });

  it("has nothing to record an Observation in yet, and says so", async () => {
    const { clock, staff } = await session("2027-01-11");

    const sent = await staff.sync.batch({
      key: key(),
      entries: [
        {
          id: recordId(),
          seq: seq(),
          kind: "observation" as const,
          tagNumber: tagOf(0),
          note: "খোঁড়াচ্ছে",
          recordedAt: clock.now(),
        },
      ],
    });

    expect(sent.results[0]).toMatchObject({ outcome: "rejected" });
    expect(sent.results[0]?.reason).toContain("not recorded yet");
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

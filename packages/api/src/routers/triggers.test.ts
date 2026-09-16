import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  DAY,
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** A check the Playbook says to do three days after an animal changes Pen. */
const afterAMoveSop = (): SopContent => ({
  name: { bn: "স্থানান্তরের পর পরীক্ষা", en: "Post-move check" },
  purpose: { bn: "নতুন পেনে মানিয়ে নিয়েছে কিনা দেখুন" },
  triggers: [{ kind: "event", event: "move", offsetDays: 3 }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    {
      id: "settled",
      text: { bn: "গাভী মানিয়ে নিয়েছে" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

/** The dry-off check: raised when a cow stops milking, not on any clock. */
const goneDrySop = (): SopContent => ({
  name: { bn: "শুকনো করার পরীক্ষা", en: "Dry-off check" },
  purpose: { bn: "শুকিয়ে যাওয়ার পর ওলান দেখুন" },
  triggers: [{ kind: "state", state: "dry" }],
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 240,
  steps: [
    {
      id: "udder",
      text: { bn: "ওলান পরীক্ষা করুন" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({
    name: `triggers-${Date.now()}`,
  });
  const from = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "পুরনো পেন",
  });
  const to = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "নতুন পেন",
  });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: from.id,
    source: "born",
    aliases: [],
  });
  await createTestClient(appRouter, { as: "staff" });
  for (const pen of [from, to]) {
    // oxlint-disable-next-line no-await-in-loop
    await scratchDb()
      .insert(penAssignment)
      .values({
        id: `pa-triggers-${pen.id}`,
        farmId: theFarm().id,
        userId: thePerson("staff").id,
        penId: pen.id,
      })
      .onConflictDoNothing();
  }

  const sop = await owner.client.sops.create({ content: afterAMoveSop() });
  const drySop = await owner.client.sops.create({ content: goneDrySop() });
  return { owner, from, to, cow, sop, drySop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

const MOVED_AT = "2026-10-01T02:00:00.000Z";

describe("work that starts because something happened", () => {
  it("raises the Instance a Move calls for, on the day the Playbook says, for the animal it happened to", async () => {
    const clock = new FakeClock(MOVED_AT);
    const owner = await createTestClient(appRouter, { as: "owner", clock });

    // Nothing yet: the SOP is published but nothing has happened to raise it.
    await owner.client.instances.ensureDue();

    await owner.client.animals.move({
      tagNumber: world.cow.tagNumber,
      toPenId: world.to.id,
      reason: "পেন পরিবর্তন",
    });
    await owner.client.instances.ensureDue();

    // Three days later it is on the list, in the Pen she moved to.
    clock.advance(3 * DAY);
    const today = await owner.client.instances.today({ penId: world.to.id });
    const mine = today.filter(
      (row) => row.definitionId === world.sop.definitionId
    );
    expect(mine).toHaveLength(1);
    // Midnight on 4 October in Dhaka: three days after she was moved means that day's work,
    // not an appointment for the hour of the night somebody happened to move her.
    expect(mine[0]?.dueAt.toISOString()).toBe("2026-10-03T18:00:00.000Z");

    // And it concerns her alone, not everything standing in that Pen.
    const board = await owner.client.instances.get({ id: mine[0]?.id ?? "" });
    expect(board.animals.map((beast) => beast.tagNumber)).toEqual([
      world.cow.tagNumber,
    ]);
  });

  it("raises it once however often the app is opened, and once more for a second Move", async () => {
    const clock = new FakeClock("2026-10-05T02:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });

    // The Move from the first test is still within the fortnight the farm looks back over.
    await owner.client.instances.ensureDue();
    await owner.client.instances.ensureDue();

    await owner.client.animals.move({
      tagNumber: world.cow.tagNumber,
      toPenId: world.from.id,
      reason: "আবার পেন পরিবর্তন",
    });
    await owner.client.instances.ensureDue();

    clock.advance(3 * DAY);
    const back = await owner.client.instances.today({ penId: world.from.id });
    const moved = await owner.client.instances.today({ penId: world.to.id });
    const mine = [...back, ...moved].filter(
      (row) => row.definitionId === world.sop.definitionId
    );

    // Two Moves, two checks — and the first one is not raised twice because the day turned.
    expect(mine.map((row) => row.dueAt.toISOString()).toSorted()).toEqual([
      "2026-10-07T18:00:00.000Z",
    ]);
    // Two Moves, two checks, and no third one for the first Move seen a second time. Other
    // test files share this database and move their own animals about, so this is counted on
    // this SOP's own Pens rather than on everything the farm has open.
    const late = await owner.client.instances.overdue();
    const mineOnly = new Set([world.from.id, world.to.id]);
    const everything = new Map(
      [...back, ...moved, ...late]
        .filter(
          (row) =>
            row.definitionId === world.sop.definitionId &&
            mineOnly.has(row.penId ?? "")
        )
        .map((row) => [row.id, row.dueAt.toISOString()])
    );
    expect([...everything.values()].toSorted()).toEqual([
      "2026-10-03T18:00:00.000Z",
      "2026-10-07T18:00:00.000Z",
    ]);
  });
});

describe("work that starts because an animal reached a State", () => {
  /** A cow walked up to Milking, so that she has a Dry to go to. */
  const milkingCow = async (clock: FakeClock) => {
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.to.id,
      source: "born",
      aliases: [],
    });
    for (const state of ["pregnant_heifer", "milking"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      await owner.client.animals.setState({ tagNumber: cow.tagNumber, state });
    }
    return { owner, cow };
  };

  const dryChecksFor = async (
    owner: Awaited<ReturnType<typeof milkingCow>>["owner"],
    tagNumber: string
  ) => {
    const open = await owner.client.instances.today({ penId: world.to.id });
    const late = await owner.client.instances.overdue();
    const byId = new Map([...open, ...late].map((row) => [row.id, row]));
    const mine = [...byId.values()].filter(
      (row) => row.definitionId === world.drySop.definitionId
    );
    const boards = await Promise.all(
      mine.map((row) => owner.client.instances.get({ id: row.id }))
    );
    return boards.filter((board) =>
      board.animals.some((beast) => beast.tagNumber === tagNumber)
    );
  };

  it("raises the check when she goes dry, once, and again the next time she does", async () => {
    const clock = new FakeClock("2026-11-01T03:00:00.000Z");
    const { owner, cow } = await milkingCow(clock);

    await owner.client.instances.ensureDue();
    expect(await dryChecksFor(owner, cow.tagNumber)).toHaveLength(0);

    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state: "dry",
    });
    await owner.client.instances.ensureDue();
    await owner.client.instances.ensureDue();
    const first = await dryChecksFor(owner, cow.tagNumber);
    expect(first).toHaveLength(1);
    expect(first[0]?.dueAt.toISOString()).toBe("2026-11-01T03:00:00.000Z");

    // Next lactation: she comes back into milk and dries off again, which is a new occasion
    // and a check somebody has to do, not one already done in the spring.
    clock.advance(5 * DAY);
    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state: "milking",
    });
    clock.advance(DAY);
    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state: "dry",
    });
    await owner.client.instances.ensureDue();
    const both = await dryChecksFor(owner, cow.tagNumber);
    expect(both.map((board) => board.dueAt.toISOString()).toSorted()).toEqual([
      "2026-11-01T03:00:00.000Z",
      "2026-11-07T03:00:00.000Z",
    ]);
  });
});

describe("what may be triggered on", () => {
  it("refuses to publish a Trigger the farm has no way of noticing", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const nonsense = {
      ...afterAMoveSop(),
      triggers: [{ kind: "event", event: "full_moon" }],
    } as unknown as SopContent;

    await expect(
      owner.client.sops.create({ content: nonsense })
    ).rejects.toThrow(/does not record "full_moon" happening/u);

    const notAState = {
      ...afterAMoveSop(),
      triggers: [{ kind: "state", state: "grumpy" }],
    } as unknown as SopContent;

    await expect(
      owner.client.sops.create({ content: notAState })
    ).rejects.toThrow(/"grumpy" is not a State an animal on the farm is in/u);

    // Sold, Died and Culled are States, but work about an animal who has left the farm is
    // work nobody can ever do.
    const gone = {
      ...afterAMoveSop(),
      triggers: [{ kind: "state", state: "sold" }],
    } as unknown as SopContent;

    await expect(owner.client.sops.create({ content: gone })).rejects.toThrow(
      /"sold" is not a State an animal on the farm is in/u
    );
  });
});

describe("arriving is not the same as being moved", () => {
  it("does not raise a post-move check for a cow who has only ever arrived", async () => {
    const clock = new FakeClock("2026-12-01T02:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });

    // Registering writes her arrival as a Move from nowhere, which is how the herd register
    // records where she started — not a Move anybody made.
    const newcomer = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.to.id,
      source: "bought",
      aliases: [],
    });
    await owner.client.instances.ensureDue();

    clock.advance(3 * DAY);
    const today = await owner.client.instances.today({ penId: world.to.id });
    const boards = await Promise.all(
      today
        .filter((row) => row.definitionId === world.sop.definitionId)
        .map((row) => owner.client.instances.get({ id: row.id }))
    );
    expect(
      boards.filter((board) =>
        board.animals.some((beast) => beast.tagNumber === newcomer.tagNumber)
      )
    ).toEqual([]);
  });
});

describe("work about one animal", () => {
  it("reaches the Staff whose Pen she is in, and follows her when she is moved again", async () => {
    const clock = new FakeClock("2026-12-10T02:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.from.id,
      source: "born",
      aliases: [],
    });

    await owner.client.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: world.to.id,
      reason: "প্রথম স্থানান্তর",
    });
    await owner.client.instances.ensureDue();

    // She is moved on again before the check comes due, so the Pen it was raised in is no
    // longer the Pen she is standing in.
    clock.advance(DAY);
    await owner.client.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: world.from.id,
      reason: "আবার",
    });

    clock.advance(2 * DAY);
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const theirs = await staff.client.instances.today({ penId: world.from.id });
    const boards = await Promise.all(
      theirs
        .filter((row) => row.definitionId === world.sop.definitionId)
        .map((row) => staff.client.instances.get({ id: row.id }))
    );
    const hers = boards.filter((board) =>
      board.animals.some((beast) => beast.tagNumber === cow.tagNumber)
    );

    // The Staff member assigned to where she actually is finds the work, and it is theirs
    // to do: the SOP assigns it to their Role.
    expect(hers).toHaveLength(1);
    expect(hers[0]?.assignedRole).toBe("staff");
    expect(hers[0]?.penId).toBe(world.from.id);
  });
});

describe("a Move that arrived from a phone", () => {
  it("raises the check once, however many times the batch is replayed", async () => {
    const clock = new FakeClock("2027-01-20T02:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    // This file's own Shed Phone: what a phone has sent is counted per phone, and a file
    // that shares one with the sync suite takes its place in the queue.
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-triggers", name: "ট্রিগার শেড ফোন" },
    });
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.from.id,
      source: "born",
      aliases: [],
    });

    // The same batch twice: a phone that sent it, lost signal before the answer, and sent
    // it again (ADR 0002).
    const batch = {
      key: `triggers-replay-${cow.tagNumber}`,
      entries: [
        {
          id: `move-${cow.tagNumber}`,
          seq: 1,
          recordedAt: clock.now(),
          kind: "animal_move" as const,
          tagNumber: cow.tagNumber,
          toPenId: world.to.id,
          reason: "শেড থেকে",
        },
      ],
    };
    const first = await phone.client.sync.batch(batch);
    const second = await phone.client.sync.batch(batch);
    expect(second).toEqual(first);

    await owner.client.instances.ensureDue();
    await owner.client.instances.ensureDue();

    clock.advance(3 * DAY);
    const today = await owner.client.instances.today({ penId: world.to.id });
    const boards = await Promise.all(
      today
        .filter((row) => row.definitionId === world.sop.definitionId)
        .map((row) => owner.client.instances.get({ id: row.id }))
    );
    expect(
      boards.filter((board) =>
        board.animals.some((beast) => beast.tagNumber === cow.tagNumber)
      )
    ).toHaveLength(1);
  });
});

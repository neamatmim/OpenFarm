import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { PushMessage, PushTarget, PushTransport } from "../push";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const suffix = `${Date.now()}`;

/** Everything the farm tried to say, and to whom. */
const listeningPost = () => {
  const sent: { target: PushTarget; message: PushMessage }[] = [];
  let answer = { delivered: true, gone: false };
  const transport: PushTransport = {
    send: (target, message) => {
      sent.push({ target, message });
      return Promise.resolve(answer);
    },
  };
  return {
    transport,
    sent,
    says(next: { delivered: boolean; gone: boolean }) {
      answer = next;
    },
  };
};

/** A one-Step SOP due at 05:00 with half an hour of grace. */
const sop = (): SopContent => ({
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
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({ name: `push-${suffix}` });
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
      id: `pa-push-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();
  const definition = await owner.client.sops.create({ content: sop() });
  return { owner, pen, definition };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

const dueAtUtc = (day: string) => new Date(`${day}T23:00:00.000Z`);
const after = (day: string, minutes: number) =>
  new Date(dueAtUtc(day).getTime() + minutes * 60_000);

let endpoints = 0;
const endpoint = () => {
  endpoints += 1;
  return `https://push.example/${suffix}-${endpoints}`;
};

/** Work that has gone late, with nobody having been told yet. */
const lateWork = async (day: string) => {
  const clock = new FakeClock(`${day}T23:05:00.000Z`);
  const scheduler = await createTestClient(appRouter, { as: "owner", clock });
  await scheduler.client.instances.ensureDue();
  const today = await scheduler.client.instances.today({ penId: world.pen.id });
  const instance = today.find(
    (row) => row.definitionId === world.definition.definitionId
  );
  if (!instance) {
    throw new Error(`expected an instance on ${day}`);
  }
  return { instance, clock };
};

describe("agreeing to be told", () => {
  it("remembers a browser, and forgets it when it says so", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const mine = endpoint();

    await manager.client.alerts.listen({
      endpoint: mine,
      p256dh: "key",
      auth: "secret",
    });
    // Subscribing twice is one browser, not two.
    await manager.client.alerts.listen({
      endpoint: mine,
      p256dh: "key",
      auth: "secret",
    });

    const trail = await manager.client.audit.list({
      entity: "push_subscription",
      entityId: mine,
    });
    expect(trail.length).toBeGreaterThan(0);

    await manager.client.alerts.stopListening({ endpoint: mine });
    await expect(
      manager.client.alerts.stopListening({ endpoint: mine })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("will not let one person silence another's browser", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const staff = await createTestClient(appRouter, { as: "staff" });
    const theirs = endpoint();
    await manager.client.alerts.listen({
      endpoint: theirs,
      p256dh: "key",
      auth: "secret",
    });

    await expect(
      staff.client.alerts.stopListening({ endpoint: theirs })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("being told", () => {
  it("reaches the Manager's browser and the app both, in their own language", async () => {
    const post = listeningPost();
    const { instance, clock } = await lateWork("2027-03-01");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    const mine = endpoint();
    await manager.client.alerts.listen({
      endpoint: mine,
      p256dh: "key",
      auth: "secret",
    });

    clock.set(after("2027-03-01", 45));
    const sweeper = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await sweeper.client.alerts.sweep();

    // The tap on the shoulder, once, on this browser. A Manager with an office machine as
    // well would get one there too, which is the point of keeping them per browser.
    const told = post.sent.filter(
      (one) =>
        one.target.endpoint === mine &&
        one.message.tag === `instance_overdue:${instance.id}`
    );
    expect(told).toHaveLength(1);
    expect(told[0]?.message).toMatchObject({
      tag: `instance_overdue:${instance.id}`,
      url: `/work/${instance.id}`,
    });
    // …in Bangla, which is what this farm reads.
    expect(told[0]?.message.body).toContain("দেরি");
    // …and the Alert itself, which is the record.
    const inbox = await sweeper.client.alerts.mine({ entityId: instance.id });
    expect(inbox.some((row) => row.kind === "instance_overdue")).toBe(true);
  });

  it("writes English to someone who reads English", async () => {
    const post = listeningPost();
    const { instance, clock } = await lateWork("2027-03-02");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await manager.client.language.set({ language: "en" });
    await manager.client.alerts.listen({
      endpoint: endpoint(),
      p256dh: "key",
      auth: "secret",
    });

    try {
      clock.set(after("2027-03-02", 45));
      const sweeper = await createTestClient(appRouter, {
        as: "manager",
        clock,
        push: post.transport,
      });
      await sweeper.client.alerts.sweep();

      const told = post.sent.find(
        (one) => one.message.tag === `instance_overdue:${instance.id}`
      );
      expect(told?.message.body).toContain("is late");
      expect(told?.message.title).toBe("Work is late");
    } finally {
      await manager.client.language.set({ language: "bn" });
    }
  });

  it("says nothing to the Owner until the escalation window has passed", async () => {
    const post = listeningPost();
    const { instance, clock } = await lateWork("2027-03-03");
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock,
      push: post.transport,
    });
    const theirs = endpoint();
    await owner.client.alerts.listen({
      endpoint: theirs,
      p256dh: "key",
      auth: "secret",
    });

    clock.set(after("2027-03-03", 45));
    const sweeper = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await sweeper.client.alerts.sweep();
    // Nothing about *this* work: other Instances left open by earlier days are long past
    // their own escalation, and the Owner hears about those.
    expect(
      post.sent.some(
        (one) =>
          one.target.endpoint === theirs &&
          one.message.tag === `instance_escalated:${instance.id}`
      )
    ).toBe(false);

    clock.set(after("2027-03-03", 3 * 60));
    const later = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await later.client.alerts.sweep();

    expect(
      post.sent.some(
        (one) =>
          one.target.endpoint === theirs &&
          one.message.tag === `instance_escalated:${instance.id}`
      )
    ).toBe(true);
  });

  it("stops telling a browser the push service says is gone", async () => {
    const post = listeningPost();
    post.says({ delivered: false, gone: true });
    const { instance, clock } = await lateWork("2027-03-04");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    const wiped = endpoint();
    await manager.client.alerts.listen({
      endpoint: wiped,
      p256dh: "key",
      auth: "secret",
    });

    clock.set(after("2027-03-04", 45));
    const sweeper = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await sweeper.client.alerts.sweep();

    // The Alert is still in the app; the browser simply stops being told.
    const inbox = await sweeper.client.alerts.mine({ entityId: instance.id });
    expect(inbox.length).toBeGreaterThan(0);
    await expect(
      manager.client.alerts.stopListening({ endpoint: wiped })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not trouble anyone when the push service is down", async () => {
    const broken: PushTransport = {
      send: () => Promise.reject(new Error("push service unavailable")),
    };
    const { instance, clock } = await lateWork("2027-03-05");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: broken,
    });
    await manager.client.alerts.listen({
      endpoint: endpoint(),
      p256dh: "key",
      auth: "secret",
    });

    clock.set(after("2027-03-05", 45));
    const sweeper = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: broken,
    });
    // No error reaches the person: the Alert is the record, and the tap on the shoulder is
    // the part that is allowed to fail.
    const swept = await sweeper.client.alerts.sweep();
    expect(swept.overdue).toBeGreaterThan(0);
    const inbox = await sweeper.client.alerts.mine({ entityId: instance.id });
    expect(inbox.some((row) => row.kind === "instance_overdue")).toBe(true);
  });
});

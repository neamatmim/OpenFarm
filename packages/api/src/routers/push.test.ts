import { eq } from "@OpenFarm/db/operators";
import { shedPhone } from "@OpenFarm/db/schema/device";
import { farm } from "@OpenFarm/db/schema/farm";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
  theShedPhone,
} from "@OpenFarm/test-harness";
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
      farmId: theFarm().id,
      userId: thePerson("staff").id,
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
  return `https://push.example.com/${suffix}-${endpoints}`;
};

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
  await sweepFrom(dueAtUtc(day));
  return { instance, clock };
};

describe("agreeing to be told", () => {
  it("remembers a browser, and forgets it when it says so", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const mine = endpoint();

    await manager.client.push.listen({
      endpoint: mine,
      p256dh: "key",
      auth: "secret",
    });
    // Subscribing twice is one browser, not two.
    await manager.client.push.listen({
      endpoint: mine,
      p256dh: "key",
      auth: "secret",
    });

    // The trail names the subscription, never the endpoint: a browser's address written
    // where everyone who can read the trail can see it is an address anyone can write to.
    const trail = await manager.client.audit.list({
      entity: "push_subscription",
    });
    expect(trail.length).toBeGreaterThan(0);
    expect(trail.some((row) => row.entityId === mine)).toBe(false);

    await manager.client.push.stopListening({ endpoint: mine });
    await expect(
      manager.client.push.stopListening({ endpoint: mine })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("will not let one person silence another's browser", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const staff = await createTestClient(appRouter, { as: "staff" });
    const theirs = endpoint();
    await manager.client.push.listen({
      endpoint: theirs,
      p256dh: "key",
      auth: "secret",
    });

    await expect(
      staff.client.push.stopListening({ endpoint: theirs })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("review findings", () => {
  it("will not let one person write over another's browser", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const staff = await createTestClient(appRouter, { as: "staff" });
    const theirs = endpoint();
    await manager.client.push.listen({
      endpoint: theirs,
      p256dh: "key",
      auth: "secret",
    });

    // An endpoint is an address, not a secret. Taking one over would silently stop its
    // owner being told — and leave the farm telling the wrong person its business.
    await expect(
      staff.client.push.listen({
        endpoint: theirs,
        p256dh: "mine",
        auth: "mine",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("will not be pointed at anything that is not a push service", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });

    // The farm's own server is what does the POSTing, so an endpoint is somewhere this
    // server can reach from inside. It has to be a push service on the open web.
    const refused = await Promise.all(
      [
        "http://push.example.com/x",
        "https://169.254.169.254/latest/meta-data",
        "https://localhost/x",
        "https://db.internal/x",
      ].map(async (address) => {
        try {
          await manager.client.push.listen({
            endpoint: address,
            p256dh: "key",
            auth: "secret",
          });
          return false;
        } catch {
          return true;
        }
      })
    );
    expect(refused).toEqual([true, true, true, true]);
  });

  it("stops telling a Shed Phone that has been revoked", async () => {
    const post = listeningPost();
    const clock = new FakeClock("2027-03-10T05:00:00.000Z");
    const phone = await createTestClient(appRouter, {
      as: "manager",
      clock,
      onShedPhone: true,
      push: post.transport,
    });
    const handset = endpoint();
    await phone.client.push.listen({
      endpoint: handset,
      p256dh: "key",
      auth: "secret",
    });

    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock,
      push: post.transport,
    });
    await owner.client.devices.revoke({ id: theShedPhone().id });

    // A handset lost in a yard that kept receiving the farm's business would be the
    // revocation not having happened at all.
    const { instance, clock: late } = await lateWork("2027-03-11");
    late.set(after("2027-03-11", 45));
    const sweeper = await createTestClient(appRouter, {
      as: "manager",
      clock: late,
      push: post.transport,
    });
    await sweeper.client.alerts.sweep();

    expect(post.sent.some((one) => one.target.endpoint === handset)).toBe(
      false
    );
    // The Alert itself still reaches them in the app.
    const inbox = await sweeper.client.alerts.mine({ entityId: instance.id });
    expect(inbox.length).toBeGreaterThan(0);

    // The file has one Shed Phone and the tests below still expect it live; put it back.
    await scratchDb()
      .update(shedPhone)
      .set({ revokedAt: null })
      .where(eq(shedPhone.id, theShedPhone().id));
  });

  it("tells the doer their work was sent back", async () => {
    const post = listeningPost();
    const { instance, clock } = await lateWork("2027-03-12");
    const staff = await createTestClient(appRouter, {
      as: "staff",
      clock,
      push: post.transport,
    });
    const theirs = endpoint();
    await staff.client.push.listen({
      endpoint: theirs,
      p256dh: "key",
      auth: "secret",
    });
    await staff.client.instances.claim({ id: instance.id });
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "clean",
      evidence: [true],
    });
    await staff.client.instances.complete({ id: instance.id });

    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await manager.client.instances.sendBack({
      id: instance.id,
      reason: "কোণা বাকি",
    });

    // Work sent back is work somebody is waiting on: it reaches their pocket, not only the
    // next time they happen to open the app.
    expect(
      post.sent.some(
        (one) =>
          one.target.endpoint === theirs &&
          one.message.tag === `instance_sent_back:${instance.id}`
      )
    ).toBe(true);
  });

  it("tells one browser once, however many sweeps run", async () => {
    const post = listeningPost();
    const { instance, clock } = await lateWork("2027-03-13");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    const mine = endpoint();
    await manager.client.push.listen({
      endpoint: mine,
      p256dh: "key",
      auth: "secret",
    });

    clock.set(after("2027-03-13", 45));
    const sweeper = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await sweeper.client.alerts.sweep();
    await sweeper.client.alerts.sweep();

    // The second sweep raises no Alert, so it taps no shoulder: a phone in a pocket should
    // not buzz twice for one thing.
    expect(
      post.sent.filter(
        (one) =>
          one.target.endpoint === mine &&
          one.message.tag === `instance_overdue:${instance.id}`
      )
    ).toHaveLength(1);
  });

  it("records against the Alert what became of telling somebody", async () => {
    const post = listeningPost();
    const { instance, clock } = await lateWork("2027-03-14");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await manager.client.push.listen({
      endpoint: endpoint(),
      p256dh: "key",
      auth: "secret",
    });

    clock.set(after("2027-03-14", 45));
    const sweeper = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await sweeper.client.alerts.sweep();

    const inbox = await sweeper.client.alerts.mine({ entityId: instance.id });
    const mine = inbox.find((row) => row.kind === "instance_overdue");
    if (!mine) {
      throw new Error("expected an alert");
    }
    const trail = await sweeper.client.audit.list({
      entity: "alert",
      entityId: mine.id,
    });
    // What became of telling this person about this thing, on this thing.
    expect(
      trail.some((row) => {
        const said = row.after as { sent?: number; kind?: string } | null;
        return said?.kind === "instance_overdue" && (said.sent ?? 0) > 0;
      })
    ).toBe(true);
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
    await manager.client.push.listen({
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
    await manager.client.push.listen({
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
    await owner.client.push.listen({
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
    const early = post.sent.filter((one) => one.target.endpoint === theirs);
    // biome-ignore lint: debug
    console.log(
      "DBG early",
      early.map((one) => one.message.tag)
    );
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
    await manager.client.push.listen({
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
      manager.client.push.stopListening({ endpoint: wiped })
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
    await manager.client.push.listen({
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

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

import { tell } from "../notice";
import type { PushMessage, PushTarget, PushTransport } from "../push";
import { aMonthOn } from "../test/carrying";
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
  const shed = await owner.client.sheds.create({ name: `push-${suffix}` });
  const pen = await owner.client.sheds.pens.create({
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
    expectedCalvingOn: aMonthOn(owner),
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
  return `https://fcm.googleapis.com/fcm/send/${suffix}-${endpoints}`;
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
  await scheduler.client.work.ensureDue();
  const today = await scheduler.client.work.today({ penId: world.pen.id });
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

    await manager.client.push.subscribe({
      endpoint: mine,
      p256dh: "key",
      auth: "secret",
    });
    // Subscribing twice is one browser, not two.
    await manager.client.push.subscribe({
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

    await manager.client.push.unsubscribe({ endpoint: mine });
    await expect(
      manager.client.push.unsubscribe({ endpoint: mine })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("will not let one person silence another's browser", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const staff = await createTestClient(appRouter, { as: "staff" });
    const theirs = endpoint();
    await manager.client.push.subscribe({
      endpoint: theirs,
      p256dh: "key",
      auth: "secret",
    });

    await expect(
      staff.client.push.unsubscribe({ endpoint: theirs })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("review findings", () => {
  it("will not let one person write over another's browser", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const staff = await createTestClient(appRouter, { as: "staff" });
    const theirs = endpoint();
    await manager.client.push.subscribe({
      endpoint: theirs,
      p256dh: "key",
      auth: "secret",
    });

    // An endpoint is an address, not a secret. Taking one over would silently stop its
    // owner being told — and leave the farm telling the wrong person its business.
    await expect(
      staff.client.push.subscribe({
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
        // A name anybody can point anywhere, the farm's own network included: resolved, it could be any of the above.
        "https://push.farm-office.example.com/x",
      ].map(async (address) => {
        try {
          await manager.client.push.subscribe({
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
    expect(refused).toEqual([true, true, true, true, true]);
  });

  it("is told by the push services the farm's browsers use", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });

    // Chrome, Android, Samsung and Opera go through Google; Firefox through Mozilla; Safari through Apple; Edge
    // through Microsoft. A Manager on any of them can agree to be told.
    for (const address of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://wns2-sg2p.notify.windows.com/w/?token=abc",
    ]) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        manager.client.push.subscribe({
          endpoint: address,
          p256dh: "key",
          auth: "secret",
        })
      ).resolves.toBeDefined();
    }
  });

  it("stops telling a Shed Phone that has been revoked", async () => {
    const post = listeningPost();
    const clock = new FakeClock("2027-03-10T05:00:00.000Z");
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      push: post.transport,
    });
    const handset = endpoint();
    await phone.client.push.subscribe({
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

  it("stops telling somebody whose Membership has ended, on their own phone too", async () => {
    const post = listeningPost();
    const clock = new FakeClock("2027-03-20T05:00:00.000Z");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    const theirOwnPhone = endpoint();
    await manager.client.push.subscribe({
      endpoint: theirOwnPhone,
      p256dh: "key",
      auth: "secret",
    });
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock,
      push: post.transport,
    });
    await owner.client.people.disable({ userId: thePerson("manager").id });
    try {
      // A Manager who has left still holds the Role on paper until the Owner takes it away; their phone should not
      // go on hearing the farm's business in the meantime.
      const { clock: late } = await lateWork("2027-03-21");
      late.set(after("2027-03-21", 45));
      const sweeper = await createTestClient(appRouter, {
        as: "owner",
        clock: late,
        push: post.transport,
      });
      await sweeper.client.alerts.sweep();

      expect(
        post.sent.some((one) => one.target.endpoint === theirOwnPhone)
      ).toBe(false);
    } finally {
      // The file shares one Manager and the tests below still expect them at work; put them back, pass or fail.
      await owner.client.people.enable({ userId: thePerson("manager").id });
    }
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
    await staff.client.push.subscribe({
      endpoint: theirs,
      p256dh: "key",
      auth: "secret",
    });
    await staff.client.work.claim({ id: instance.id });
    await staff.client.work.completeStep({
      instanceId: instance.id,
      stepId: "clean",
      evidence: [true],
    });
    await staff.client.work.complete({ id: instance.id });

    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await manager.client.work.sendBack({
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
    await manager.client.push.subscribe({
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
    // After every other day this file turns: a turn catches up the days it missed, and an earlier one must not.
    const { instance, clock } = await lateWork("2027-03-25");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await manager.client.push.subscribe({
      endpoint: endpoint(),
      p256dh: "key",
      auth: "secret",
    });

    clock.set(after("2027-03-25", 45));
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
    await manager.client.push.subscribe({
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
    await manager.client.push.subscribe({
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
    await owner.client.push.subscribe({
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
    await manager.client.push.subscribe({
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
      manager.client.push.unsubscribe({ endpoint: wiped })
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
    await manager.client.push.subscribe({
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

describe("a notice raised where no push followed it", () => {
  it("is carried by the next sweep while the farm is awake: a dose from an expired Lot reaches the Manager's pocket", async () => {
    const post = listeningPost();
    // Ten in the morning, farm time, on a day of its own.
    const clock = new FakeClock("2027-04-02T04:00:00.000Z");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    const mine = endpoint();
    await manager.client.push.subscribe({
      endpoint: mine,
      p256dh: "key",
      auth: "secret",
    });
    // Raised as the dose's own write raises it: the notice, and no push behind it.
    const id = `expired-dose-${suffix}`;
    await scratchDb().transaction((tx) =>
      tell(
        tx,
        theFarm().id,
        {
          kind: "expired_dose_given",
          about: { id },
          facts: {
            tag: "BD-0142",
            name: "অক্সিটেট্রাসাইক্লিন",
            lotNumber: `LOT-${suffix}`,
            expiresOn: "2027-03-01",
          },
        },
        clock.now()
      )
    );
    await manager.client.alerts.sweep();
    const pushed = post.sent.filter(
      (one) => one.target.endpoint === mine && one.message.tag?.includes(id)
    );
    expect(pushed).toHaveLength(1);
    // And it opens her page, as the list leads, not the day's work.
    expect(pushed[0]?.message.url).toBe("/animals/BD-0142");
  });
});

describe("whose a browser's pushes are", () => {
  it("follows whoever is PIN-switched in on the Shed Phone", async () => {
    const post = listeningPost();
    const clock = new FakeClock("2027-04-05T05:00:00.000Z");
    const handset = endpoint();
    const first = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      push: post.transport,
    });
    await first.client.push.subscribe({
      endpoint: handset,
      p256dh: "key",
      auth: "secret",
    });
    // The next milker PINs in on the same handset, which now speaks for them.
    const next = await createTestClient(appRouter, {
      as: "otherStaff",
      clock,
      onShedPhone: true,
      push: post.transport,
    });
    await expect(
      next.client.push.subscribe({
        endpoint: handset,
        p256dh: "key",
        auth: "secret",
      })
    ).resolves.toBeDefined();
    const row = await scratchDb().query.pushSubscription.findFirst({
      where: { endpoint: handset },
      columns: { userId: true },
    });
    expect(row?.userId).toBe(thePerson("otherStaff").id);
  });

  it("is given up by signing out, and the next person on that browser is told instead", async () => {
    const post = listeningPost();
    const clock = new FakeClock("2027-04-06T05:00:00.000Z");
    const office = endpoint();
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock,
      push: post.transport,
    });
    await owner.client.push.subscribe({
      endpoint: office,
      p256dh: "key",
      auth: "secret",
    });
    // Signing out of the office computer forgets its browser, as the web's sign-out asks.
    await owner.client.push.unsubscribe({ endpoint: office });
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await expect(
      manager.client.push.subscribe({
        endpoint: office,
        p256dh: "key",
        auth: "secret",
      })
    ).resolves.toBeDefined();
  });

  it("is never taken from somebody still listening, off a Shed Phone", async () => {
    const post = listeningPost();
    const clock = new FakeClock("2027-04-07T05:00:00.000Z");
    const theirs = endpoint();
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock,
      push: post.transport,
    });
    await owner.client.push.subscribe({
      endpoint: theirs,
      p256dh: "key",
      auth: "secret",
    });
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await expect(
      manager.client.push.subscribe({
        endpoint: theirs,
        p256dh: "key",
        auth: "secret",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("a session the Owner signs out from the People page", () => {
  it("takes that phone's pushes with it: a phone left in a yard stops showing the farm's business", async () => {
    const post = listeningPost();
    const clock = new FakeClock("2027-04-08T05:00:00.000Z");
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    const yard = endpoint();
    await manager.client.push.subscribe({
      endpoint: yard,
      p256dh: "key",
      auth: "secret",
    });
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock,
      push: post.transport,
    });
    const managerId = thePerson("manager").id;
    await owner.client.people.signOut({
      userId: managerId,
      sessionId: `session-${managerId}`,
    });
    const row = await scratchDb().query.pushSubscription.findFirst({
      where: { endpoint: yard },
      columns: { revokedAt: true },
    });
    expect(row?.revokedAt).not.toBeNull();
  });
});

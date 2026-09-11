import { uuidv7 } from "@OpenFarm/db/ids";
import { alert } from "@OpenFarm/db/schema/alert";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { PushMessage, PushTarget, PushTransport } from "../push";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** Everything the farm tried to say, and to whom. */
const listeningPost = () => {
  const sent: { target: PushTarget; message: PushMessage }[] = [];
  const transport: PushTransport = {
    send: (target, message) => {
      sent.push({ target, message });
      return Promise.resolve({ delivered: true, gone: false });
    },
  };
  return { transport, sent };
};

/**
 * A Manager listening on one browser, ready to be told things.
 *
 * The endpoint comes back because a person's earlier browsers are still subscribed — a
 * Manager with a phone and an office computer is told on both, which is the point — so a
 * test asserts about the browser it registered rather than about the count.
 */
const listening = async (clock: FakeClock, transport: PushTransport) => {
  const manager = await createTestClient(appRouter, {
    as: "manager",
    clock,
    push: transport,
  });
  const endpoint = `https://push.example.com/digest-${Date.now()}-${Math.random()}`;
  await manager.client.push.listen({
    endpoint,
    p256dh: "test-p256dh-key",
    auth: "test-auth-key",
  });
  return { manager, endpoint };
};

/** Something the notification table says waits for a digest. */
const quietNotice = async (at: Date, userId = "test-manager") => {
  await scratchDb()
    .insert(alert)
    .values({
      id: uuidv7(at),
      farmId: TEST_FARM.id,
      userId,
      kind: "needs_review",
      entity: "step_completion",
      entityId: `digest-${at.getTime()}`,
      params: { sopBn: "দোহন", sopEn: "Milking", pen: "শেড ১ / পেন ১" },
      createdAt: at,
    })
    .onConflictDoNothing();
};

beforeAll(async () => {
  await createTestClient(appRouter, { as: "manager" });
});

describe("the evening digest", () => {
  it("holds what does not need saying now, and says it all at once", async () => {
    // Nine in the morning on the farm's clock: 03:00 UTC.
    const clock = new FakeClock("2027-12-01T03:00:00.000Z");
    const post = listeningPost();
    const { manager, endpoint } = await listening(clock, post.transport);
    await quietNotice(clock.now());
    await quietNotice(new Date(clock.now().getTime() + 60_000));

    // Nothing reaches a pocket in the middle of the morning.
    expect(post.sent).toEqual([]);

    // Six in the evening, farm time.
    clock.set("2027-12-01T12:00:00.000Z");
    const sent = await manager.client.alerts.digest();

    // Other test files leave the farm their own notices, so what is asserted is this
    // browser's digest rather than the farm's count of them.
    expect(sent.people).toBeGreaterThanOrEqual(1);
    const mine = post.sent.filter((one) => one.target.endpoint === endpoint);
    expect(mine).toHaveLength(1);
    // Two things, in the numerals the reader reads.
    expect(mine[0]?.message.body).toContain("২");
    expect(mine[0]?.message.url).toBe("/today");
  });

  it("sends nothing when there is nothing to say", async () => {
    const clock = new FakeClock("2027-12-02T12:00:00.000Z");
    const post = listeningPost();
    const { manager } = await listening(clock, post.transport);

    const sent = await manager.client.alerts.digest();

    // Nothing of this Manager's was waiting, so nothing reached this browser — whatever
    // else the farm had to carry for other people.
    expect(sent.told.sent).toBe(0);
    expect(post.sent).toEqual([]);
  });

  it("carries each notice once, however often the app is opened", async () => {
    const clock = new FakeClock("2027-12-03T12:00:00.000Z");
    const post = listeningPost();
    const { manager, endpoint } = await listening(clock, post.transport);
    await quietNotice(clock.now());

    const first = await manager.client.alerts.digest();
    const again = await manager.client.alerts.digest();

    expect(first.people).toBeGreaterThanOrEqual(1);
    // Nothing left waiting, so the second call has nothing to carry.
    expect(again.people).toBe(0);
    expect(
      post.sent.filter((one) => one.target.endpoint === endpoint)
    ).toHaveLength(1);
  });

  it("holds the digest through quiet hours and carries it when the farm wakes", async () => {
    // Half past ten at night, farm time: inside the quiet hours the farm keeps.
    const clock = new FakeClock("2027-12-03T16:30:00.000Z");
    const post = listeningPost();
    const { manager, endpoint } = await listening(clock, post.transport);
    await quietNotice(clock.now());

    const atNight = await manager.client.alerts.digest();
    expect(atNight.people).toBe(0);
    expect(post.sent).toEqual([]);

    // Six in the morning, and the farm is awake.
    clock.set("2027-12-04T00:00:00.000Z");
    const morning = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    const atDawn = await morning.client.alerts.digest();

    expect(atDawn.people).toBeGreaterThanOrEqual(1);
    expect(
      post.sent.filter((one) => one.target.endpoint === endpoint)
    ).toHaveLength(1);
  });

  it("leaves what must be said now to say itself", async () => {
    const clock = new FakeClock("2027-12-05T12:00:00.000Z");
    const post = listeningPost();
    const { manager } = await listening(clock, post.transport);

    // An Alert proper, which travels the moment it is raised and is not the digest's to
    // carry — it must not be counted, held, or sent twice.
    await scratchDb()
      .insert(alert)
      .values({
        id: uuidv7(clock.now()),
        farmId: TEST_FARM.id,
        userId: "test-manager",
        kind: "instance_overdue",
        entity: "sop_instance",
        entityId: `urgent-${Date.now()}`,
        params: { sopBn: "দোহন", pen: "শেড ১" },
        createdAt: clock.now(),
      })
      .onConflictDoNothing();

    const sent = await manager.client.alerts.digest();

    // The overdue Alert said itself when it was raised; the digest does not carry it, and
    // this browser hears nothing.
    expect(sent.told.sent).toBe(0);
    expect(post.sent).toEqual([]);
  });

  it("carries the post when the farm says to, not when the code was written", async () => {
    const clock = new FakeClock("2027-12-06T05:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const post = listeningPost();
    const { manager, endpoint } = await listening(clock, post.transport);
    await quietNotice(clock.now());

    // Eleven in the morning, farm time: the morning post has already gone, and this notice
    // was raised after it.
    const beforeTheChange = await manager.client.alerts.digest();
    expect(beforeTheChange.told.sent).toBe(0);

    // The farm decides it wants its post at eleven.
    await owner.client.farm.setParameters({ digestTimes: ["11:00"] });
    const atEleven = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await atEleven.client.alerts.digest();

    expect(
      post.sent.filter((one) => one.target.endpoint === endpoint)
    ).toHaveLength(1);

    // Put back, so the farm the other tests share keeps its own hours.
    await owner.client.farm.setParameters({ digestTimes: ["06:00", "18:00"] });
  });

  it("refuses a time of day that is not one", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await expect(
      owner.client.farm.setParameters({ quietFrom: "half past ten" })
    ).rejects.toThrow(/is not a time of day/u);
  });

  it("does not carry what was raised after the post went", async () => {
    // Half past six in the evening, farm time: the evening post has gone.
    const clock = new FakeClock("2027-12-07T12:30:00.000Z");
    const post = listeningPost();
    const { manager, endpoint } = await listening(clock, post.transport);

    // Raised at half past six, which is after the six o'clock carrying moment.
    await quietNotice(clock.now());
    await manager.client.alerts.digest();

    // It waits for the morning rather than going out on its own.
    expect(post.sent.filter((one) => one.target.endpoint === endpoint)).toEqual(
      []
    );

    clock.set("2027-12-08T00:30:00.000Z");
    const morning = await createTestClient(appRouter, {
      as: "manager",
      clock,
      push: post.transport,
    });
    await morning.client.alerts.digest();

    expect(
      post.sent.filter((one) => one.target.endpoint === endpoint)
    ).toHaveLength(1);
  });
});

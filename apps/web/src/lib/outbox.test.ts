import { DefaultRetryPolicy } from "@tanstack/offline-transactions";
import type { StorageAdapter } from "@tanstack/offline-transactions";
import { beforeEach, describe, expect, it } from "vitest";

import type { EntryVerdict, Transport } from "./outbox";
import { Outbox } from "./outbox";

/** Storage a test can hold in its hand. The real one is IndexedDB, which behaves the same
 *  way and is the reason the outbox talks to an adapter rather than to a database. */
class MemoryStorage implements StorageAdapter {
  readonly rows = new Map<string, string>();
  get(key: string) {
    return Promise.resolve(this.rows.get(key) ?? null);
  }
  set(key: string, value: string) {
    this.rows.set(key, value);
    return Promise.resolve();
  }
  delete(key: string) {
    this.rows.delete(key);
    return Promise.resolve();
  }
  keys() {
    return Promise.resolve([...this.rows.keys()]);
  }
  clear() {
    this.rows.clear();
    return Promise.resolve();
  }
}

interface Sent {
  key: string;
  sentAt: string;
  entries: Record<string, unknown>[];
}

/** Everything the farm took. */
const takesEverything = (batch: Sent) => ({
  results: batch.entries.map((entry) => ({
    id: String(entry.id),
    seq: Number(entry.seq),
    outcome: "applied" as const,
  })),
});

/** A farm that says whatever the test tells it to. */
const fakeFarm = () => {
  const sends: Sent[] = [];
  let answer: (batch: Sent) => { results: EntryVerdict[] } = takesEverything;
  let refuse: object | null = null;
  const transport: Transport = {
    send: (batch) => {
      sends.push(batch);
      if (refuse) {
        return Promise.reject(refuse);
      }
      return Promise.resolve(answer(batch));
    },
  };
  return {
    transport,
    sends,
    says(next: (batch: Sent) => { results: EntryVerdict[] }) {
      answer = next;
      refuse = null;
    },
    refuses(error: object) {
      refuse = error;
    },
  };
};

let storage: MemoryStorage;
let farm: ReturnType<typeof fakeFarm>;
let at: Date;
let keys: number;

const outboxOn = (storageOverride?: MemoryStorage) =>
  new Outbox({
    storage: storageOverride ?? storage,
    transport: farm.transport,
    retry: new DefaultRetryPolicy(5, false),
    now: () => at,
    newKey: () => {
      keys += 1;
      return `key-${keys}`;
    },
  });

beforeEach(() => {
  storage = new MemoryStorage();
  farm = fakeFarm();
  at = new Date("2027-02-01T05:00:00.000Z");
  keys = 0;
});

const milk = (litres: number) => ({
  instanceId: "instance-1",
  stepId: "milk",
  animalTag: "D-0001",
  evidence: [litres],
});

describe("recording with no signal", () => {
  it("keeps entries in the order they happened, and sends them that way", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    await outbox.add("step_completion", milk(9), "b");
    await outbox.add("step_completion", milk(7), "c");

    const queued = await outbox.state();
    expect(queued.pending).toBe(3);
    await outbox.flush();

    expect(farm.sends).toHaveLength(1);
    expect(farm.sends[0]?.entries.map((entry) => entry.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(farm.sends[0]?.entries.map((entry) => entry.seq)).toEqual([1, 2, 3]);
    expect(await outbox.state()).toMatchObject({ pending: 0, rejected: 0 });
  });

  it("survives the app being closed: the queue is on the device, not in the page", async () => {
    const first = outboxOn();
    await first.add("step_completion", milk(11), "a");

    // A new Outbox over the same storage is what a restarted app has.
    const second = outboxOn();

    const restored = await second.state();
    expect(restored.pending).toBe(1);
    await second.flush();
    expect(farm.sends[0]?.entries[0]?.id).toBe("a");
  });
});

describe("sending", () => {
  it("keeps one key for a batch and reuses it on every retry", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    farm.refuses(new Error("no route to host"));

    await outbox.flush();
    // The backoff has to pass before the next attempt is even tried.
    at = new Date(at.getTime() + 60_000);
    await outbox.flush();
    at = new Date(at.getTime() + 60_000);
    farm.says(takesEverything);
    await outbox.flush();

    expect(farm.sends).toHaveLength(3);
    expect(new Set(farm.sends.map((sent) => sent.key))).toEqual(
      new Set(["key-1"])
    );
    const settled = await outbox.state();
    expect(settled.pending).toBe(0);
  });

  it("waits longer each time, and does not send again before it is due", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    farm.refuses(new Error("no route to host"));

    await outbox.flush();
    // Immediately again: nothing goes out, because the backoff has not run down.
    await outbox.flush();

    expect(farm.sends).toHaveLength(1);
  });

  it("only one tab sends", async () => {
    const outbox = new Outbox({
      storage,
      transport: farm.transport,
      retry: new DefaultRetryPolicy(5, false),
      now: () => at,
      leader: {
        requestLeadership: () => Promise.resolve(false),
        releaseLeadership: () => {},
        isLeader: () => false,
        onLeadershipChange: () => () => {},
      },
    });
    await outbox.add("step_completion", milk(11), "a");

    await outbox.flush();

    expect(farm.sends).toEqual([]);
    const state = await outbox.state();
    expect(state.pending).toBe(1);
  });

  it("does not try at all with no signal", async () => {
    const outbox = new Outbox({
      storage,
      transport: farm.transport,
      retry: new DefaultRetryPolicy(5, false),
      now: () => at,
      online: {
        isOnline: () => false,
        subscribe: () => () => {},
        notifyOnline: () => {},
        dispose: () => {},
      },
    });
    await outbox.add("step_completion", milk(11), "a");

    await outbox.flush();

    expect(farm.sends).toEqual([]);
  });
});

describe("when the farm answers", () => {
  it("keeps what the farm sent back, with the data, so it can be entered again", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    await outbox.add("step_completion", milk(9), "b");
    farm.says((batch) => ({
      results: batch.entries.map((entry, index) => ({
        id: String(entry.id),
        seq: Number(entry.seq),
        outcome: index === 0 ? ("rejected" as const) : ("applied" as const),
        reason: index === 0 ? "no animal with tag D-0001" : undefined,
      })),
    }));

    await outbox.flush();

    const state = await outbox.state();
    expect(state).toMatchObject({ pending: 0, rejected: 1 });
    const held = await outbox.rejected();
    expect(held[0]?.reason).toContain("D-0001");
    // The figures the person typed are still there to put right.
    expect(held[0]?.entry.body).toMatchObject({ evidence: [11] });

    await outbox.discard("a");
    const cleared = await outbox.state();
    expect(cleared.rejected).toBe(0);
  });

  it("lets go of an entry the farm kept for review: it is the farm's business now", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    farm.says((batch) => ({
      results: batch.entries.map((entry) => ({
        id: String(entry.id),
        seq: Number(entry.seq),
        outcome: "kept" as const,
        reason: "that animal is not in this pen",
      })),
    }));

    const { verdicts } = await outbox.flush();

    expect(verdicts[0]?.outcome).toBe("kept");
    expect(await outbox.state()).toMatchObject({ pending: 0, rejected: 0 });
  });

  it("tells the farm what time it thinks it is, so a wrong clock is visible", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");

    await outbox.flush();

    expect(farm.sends[0]?.sentAt).toBe(at.toISOString());
  });

  it("remembers when the farm last took something", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");

    await outbox.flush();

    const state = await outbox.state();
    expect(state.lastSyncAt).toBe(at.toISOString());
  });
});

describe("what one send carries", () => {
  it("splits a heavy queue rather than sending a request no phone will finish", async () => {
    const outbox = outboxOn();
    // Three shed photos of a megabyte and a half: two fit the budget for one send.
    const photo = {
      contentType: "image/jpeg" as const,
      data: "x".repeat(1_500_000),
    };
    await outbox.add("step_completion", { ...milk(11), photo }, "a");
    await outbox.add("step_completion", { ...milk(9), photo }, "b");
    await outbox.add("step_completion", { ...milk(7), photo }, "c");

    await outbox.flush();

    // Two fit the budget; the third waits for the next send rather than making a request
    // that will time out on a weak signal and take the other two down with it.
    expect(farm.sends[0]?.entries.map((entry) => entry.id)).toEqual(["a", "b"]);
    const left = await outbox.state();
    expect(left.pending).toBe(1);

    await outbox.flush();
    expect(farm.sends[1]?.entries.map((entry) => entry.id)).toEqual(["c"]);
    // A second batch is a second transaction, so a second key.
    expect(farm.sends[1]?.key).not.toBe(farm.sends[0]?.key);
  });
});

describe("a shift with no signal", () => {
  it("holds the claim, the cows and the finish, and sends them in that order", async () => {
    const outbox = outboxOn();
    await outbox.add("instance_claim", { instanceId: "instance-1" }, "claim");
    await outbox.add("step_completion", milk(12.5), "cow-1");
    await outbox.add("step_completion", milk(9.5), "cow-2");
    await outbox.add(
      "instance_complete",
      { instanceId: "instance-1" },
      "finish"
    );

    await outbox.flush();

    // One send, and the farm reads it the way the shed did it: taken, milked, finished.
    expect(farm.sends).toHaveLength(1);
    expect(farm.sends[0]?.entries.map((entry) => entry.kind)).toEqual([
      "instance_claim",
      "step_completion",
      "step_completion",
      "instance_complete",
    ]);
    const left = await outbox.state();
    expect(left.pending).toBe(0);
  });

  it("shows what the farm took but put in front of somebody", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    farm.says((batch) => ({
      results: batch.entries.map((entry) => ({
        id: String(entry.id),
        seq: Number(entry.seq),
        outcome: "kept" as const,
        reason: "someone else is working on this",
      })),
    }));

    await outbox.flush();

    const state = await outbox.state();
    expect(state).toMatchObject({ pending: 0, rejected: 0, reviewed: 1 });
    const looked = await outbox.reviewed();
    expect(looked[0]?.reason).toContain("someone else");
    // The person's own figures are there, so they can see what became of them.
    expect(looked[0]?.entry.body).toMatchObject({ evidence: [11] });

    await outbox.discard("a");
    const cleared = await outbox.state();
    expect(cleared.reviewed).toBe(0);
  });
});

describe("what a crash must not cost", () => {
  it("finishes putting away an answer it had already been given", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    await outbox.add("step_completion", milk(9), "b");
    farm.says((batch) => ({
      results: batch.entries.map((entry, index) => ({
        id: String(entry.id),
        seq: Number(entry.seq),
        outcome: index === 0 ? ("rejected" as const) : ("applied" as const),
        reason: index === 0 ? "no animal with tag D-0001" : undefined,
      })),
    }));
    await outbox.flush();

    // A phone that died here would once have come back, found a shorter queue, and offered
    // the farm the same key with fewer entries — which the farm rightly refuses, and which
    // would have dumped a morning's work onto the rejected list.
    const restarted = outboxOn();
    await restarted.flush();

    // Nothing sent again, and the answer is where it should be.
    expect(farm.sends).toHaveLength(1);
    const state = await restarted.state();
    expect(state).toMatchObject({ pending: 0, rejected: 1 });
  });

  it("does not throw the queue away over a farm that is merely busy", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    farm.refuses({ status: 429, message: "too many requests" });

    await outbox.flush();

    // Still waiting, not handed back: "not now" is not "not ever".
    const state = await outbox.state();
    expect(state).toMatchObject({ pending: 1, rejected: 0 });
  });

  it("remembers it was signed out, even after a restart", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    farm.refuses({ code: "UNAUTHORIZED", status: 401 });
    await outbox.flush();

    const restarted = outboxOn();
    await restarted.flush();

    expect(farm.sends).toHaveLength(1);
    const state = await restarted.state();
    expect(state).toMatchObject({ paused: "signed_out", pending: 1 });
  });

  it("gives two entries recorded in the same instant their own numbers", async () => {
    const outbox = outboxOn();

    await Promise.all([
      outbox.add("step_completion", milk(11), "a"),
      outbox.add("step_completion", milk(9), "b"),
      outbox.add("step_completion", milk(7), "c"),
    ]);

    const waiting = await outbox.pending();
    expect(waiting).toHaveLength(3);
    expect(new Set(waiting.map((entry) => entry.seq)).size).toBe(3);
  });
});

describe("when the session has gone", () => {
  it("stops, says so, and loses nothing", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    await outbox.add("step_completion", milk(9), "b");
    farm.refuses({ code: "UNAUTHORIZED", status: 401 });

    await outbox.flush();

    expect(await outbox.state()).toMatchObject({
      paused: "signed_out",
      pending: 2,
    });
    // Nothing else goes out while it is waiting for somebody to sign in.
    await outbox.flush();
    expect(farm.sends).toHaveLength(1);

    farm.says(takesEverything);
    outbox.resume();
    await outbox.flush();

    expect(await outbox.state()).toMatchObject({ paused: "none", pending: 0 });
    // The same key it would have used before: signing in again is not new work.
    expect(farm.sends[1]?.key).toBe(farm.sends[0]?.key);
  });
});

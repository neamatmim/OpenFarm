import { DefaultRetryPolicy } from "@tanstack/offline-transactions";
import type { StorageAdapter } from "@tanstack/offline-transactions";
import { beforeEach, describe, expect, it } from "vitest";

import type { EntryVerdict, ProofSettled, Transport } from "./outbox";
import { Outbox } from "./outbox";
import { RecoveryError } from "./outbox-recovery";

/** Storage a test can hold in its hand. The real one is IndexedDB, which behaves the same
 *  way and is the reason the outbox talks to an adapter rather than to a database. */
class MemoryStorage implements StorageAdapter {
  readonly rows = new Map<string, string>();
  // Reassigned by failDeletesAfter, so a test can stop the phone partway through its bookkeeping.
  // oxlint-disable-next-line no-unused-private-class-members
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
  /** A phone that dies after this many deletes: what is written stays written, the rest never happens. */
  failDeletesAfter(deletes: number) {
    let left = deletes;
    const real = this.delete.bind(this);
    this.delete = (key: string) => {
      if (left <= 0) {
        return Promise.reject(new Error("the phone died"));
      }
      left -= 1;
      return real(key);
    };
    return {
      stop: () => {
        this.delete = real;
      },
    };
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

/** A Shed Phone: every entry is recorded under the person switched in, and carries the reference of the PIN they
 *  entered — which is worth whatever the phone says it is worth when a Batch is frozen. */
const shedPhoneOn = (
  settleProofs: () => Promise<Map<string, ProofSettled>>,
  options: { storage?: MemoryStorage; attempts?: number } = {}
) =>
  new Outbox({
    storage: options.storage ?? storage,
    transport: farm.transport,
    retry: new DefaultRetryPolicy(options.attempts ?? 5, false),
    now: () => at,
    newKey: () => {
      keys += 1;
      return `key-${keys}`;
    },
    actorOf: () => "staff-a",
    proofOf: () => "pin-1",
    settleProofs,
  });

beforeEach(() => {
  storage = new MemoryStorage();
  farm = fakeFarm();
  at = new Date("2027-02-01T05:00:00.000Z");
  keys = 0;
});

const milk = (liters: number) => ({
  instanceId: "instance-1",
  stepId: "milk",
  animalTag: "D-0001",
  evidence: [liters],
});

describe("recording with no signal", () => {
  it("names whoever was working when each entry was recorded, not whoever is working when it is sent", async () => {
    let working = "staff-a";
    const outbox = new Outbox({
      storage,
      transport: farm.transport,
      retry: new DefaultRetryPolicy(5, false),
      now: () => at,
      actorOf: () => working,
      proofOf: () => `token-of-${working}`,
    });
    await outbox.add("step_completion", milk(11), "a");
    working = "staff-b";
    await outbox.add("step_completion", milk(9), "b");

    await outbox.flush();

    expect(farm.sends[0]?.entries.map((entry) => entry.actorId)).toEqual([
      "staff-a",
      "staff-b",
    ]);
    // And each carries the token of the stint it was recorded in, for the farm to check it against.
    expect(farm.sends[0]?.entries.map((entry) => entry.switchToken)).toEqual([
      "token-of-staff-a",
      "token-of-staff-b",
    ]);
  });

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

  it("offers the same key the same entries, however the phone's proofs change under it", async () => {
    let worth = new Map<string, ProofSettled>([["pin-1", { token: "first" }]]);
    const outbox = shedPhoneOn(() => Promise.resolve(worth));
    await outbox.add("step_completion", milk(11), "a");
    farm.refuses(new Error("no route to host"));
    await outbox.flush();

    // The phone changes its mind about the PIN between attempts — and the Batch does not.
    worth = new Map<string, ProofSettled>([["pin-1", "refused"]]);
    at = new Date(at.getTime() + 60_000);
    farm.says(takesEverything);
    await outbox.flush();

    const [first, second] = farm.sends;
    expect(second?.key).toBe(first?.key);
    expect(second?.entries).toEqual(first?.entries);
    expect(first?.entries[0]?.switchToken).toBe("first");
  });

  it("sends what it froze after a restart, not what it would freeze now", async () => {
    let worth = new Map<string, ProofSettled>([["pin-1", { token: "first" }]]);
    const outbox = shedPhoneOn(() => Promise.resolve(worth));
    await outbox.add("step_completion", milk(11), "a");
    farm.refuses(new Error("no route to host"));
    await outbox.flush();

    // The app is closed and opened again, and the phone would now say something else about that PIN.
    worth = new Map<string, ProofSettled>([["pin-1", { token: "second" }]]);
    at = new Date(at.getTime() + 60_000);
    farm.says(takesEverything);
    await shedPhoneOn(() => Promise.resolve(worth)).flush();

    const [first, second] = farm.sends;
    expect(second?.key).toBe(first?.key);
    expect(second?.entries).toEqual(first?.entries);
    expect(second?.entries[0]?.switchToken).toBe("first");
  });

  it("waits for a PIN a tab still holds: nothing sent, nothing handed back, no attempt used up", async () => {
    let worth = new Map<string, ProofSettled>([["pin-1", "waiting"]]);
    const outbox = shedPhoneOn(() => Promise.resolve(worth), { attempts: 2 });
    await outbox.add("step_completion", milk(11), "a");

    // More flushes than the farm allows attempts: waiting is not failing, so nothing is handed back.
    await outbox.flush();
    await outbox.flush();
    await outbox.flush();
    await outbox.flush();
    expect(farm.sends).toHaveLength(0);
    expect(await outbox.state()).toMatchObject({ pending: 1, rejected: 0 });

    // The PIN is proved, and the morning's work goes with it.
    worth = new Map<string, ProofSettled>([["pin-1", { token: "proved" }]]);
    await outbox.flush();
    expect(farm.sends[0]?.entries[0]?.switchToken).toBe("proved");
    expect(await outbox.state()).toMatchObject({ pending: 0, rejected: 0 });
  });

  it("sends a PIN the farm refused unproved, for the farm to say so", async () => {
    const outbox = shedPhoneOn(() =>
      Promise.resolve(new Map<string, ProofSettled>([["pin-1", "refused"]]))
    );
    await outbox.add("step_completion", milk(11), "a");
    await outbox.flush();

    const [sent] = farm.sends;
    // Under the person who recorded it, with nothing claiming to prove it — which is the farm's to judge, not
    // the phone's, and not something the phone may pass off as a proof of its own.
    expect(sent?.entries[0]).toMatchObject({ actorId: "staff-a" });
    expect(sent?.entries[0]?.switchToken).toBeUndefined();
    expect(sent?.entries[0]).not.toHaveProperty("proof");
  });

  it("finishes handing back a batch the farm will never take, rather than sending it again", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    await outbox.add("step_completion", milk(9), "b");
    farm.refuses({ status: 422, message: "the farm will not have it" });
    // The phone dies partway through putting the refusal away: the first entry is filed, the second is not.
    const dying = storage.failDeletesAfter(1);
    await expect(outbox.flush()).rejects.toThrow("the phone died");
    dying.stop();

    // Back on, with the answer already written down: it is finished, and nothing goes to the farm a second time.
    farm.says(takesEverything);
    await outboxOn().flush();

    expect(farm.sends).toHaveLength(1);
    expect(await outboxOn().state()).toMatchObject({ pending: 0, rejected: 2 });
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
        ...(index === 0
          ? {
              refusal: { category: "wrong" as const, word: "count_incomplete" },
            }
          : {}),
      })),
    }));

    await outbox.flush();

    const state = await outbox.state();
    expect(state).toMatchObject({ pending: 0, rejected: 1 });
    const held = await outbox.rejected();
    expect(held[0]?.reason).toContain("D-0001");
    // And why, in the words the screen puts into the reader's language.
    expect(held[0]?.refusal).toEqual({
      category: "wrong",
      word: "count_incomplete",
    });
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

/** A shed photo of a megabyte and a half, against a Step. */
const photo = (completionId: string) => ({
  completionId,
  slot: 0,
  contentType: "image/jpeg" as const,
  data: "x".repeat(1_500_000),
});

describe("what one send carries", () => {
  it("splits a heavy queue rather than sending a request no phone will finish", async () => {
    const outbox = outboxOn();
    // Three shed photos of a megabyte and a half: two fit the budget for one send.
    await outbox.add("completion_photo", photo("milk-a"), "a");
    await outbox.add("completion_photo", photo("milk-b"), "b");
    await outbox.add("completion_photo", photo("milk-c"), "c");

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

  it("keeps trying through hours of no signal and a restarting farm, and never hands the work back for it", async () => {
    const outbox = outboxOn();
    for (const [i, liters] of [11, 9, 7].entries()) {
      // oxlint-disable-next-line no-await-in-loop
      await outbox.add("step_completion", milk(liters), `weak-${i}`);
    }
    const failures = [
      new TypeError("Failed to fetch"),
      { code: "SERVICE_UNAVAILABLE", message: "Service Unavailable" },
      { code: "GATEWAY_TIMEOUT", message: "Gateway Timeout" },
      { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error" },
    ];
    // Six hours of a weak signal and a farm being restarted, tried every time it is due.
    for (let minute = 0; minute < 6 * 60; minute += 1) {
      farm.refuses(failures[minute % failures.length] as object);
      at = new Date(at.getTime() + 60_000);
      // oxlint-disable-next-line no-await-in-loop
      await outbox.flush();
    }
    expect(farm.sends.length).toBeGreaterThan(12);
    // Still waiting, all of it, and the phone does not claim the farm took anything.
    expect(await outbox.state()).toMatchObject({
      pending: 3,
      rejected: 0,
      lastSyncAt: null,
    });

    farm.says(takesEverything);
    at = new Date(at.getTime() + 60 * 60_000);
    await outbox.flush();
    expect(await outbox.state()).toMatchObject({ pending: 0, rejected: 0 });
  });

  it("hands back a batch the farm refused by its code, as an oRPC error comes with no HTTP status", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    farm.refuses({ code: "BAD_REQUEST", message: "Input validation failed" });

    await outbox.flush();

    expect(await outbox.state()).toMatchObject({
      pending: 0,
      rejected: 1,
      lastSyncAt: null,
    });
  });

  it("tries again a batch the farm is still applying from the last try", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    farm.refuses({
      code: "CONFLICT",
      message: "That batch is still being applied",
      data: { refusal: "still_applying" },
    });

    await outbox.flush();

    expect(await outbox.state()).toMatchObject({ pending: 1, rejected: 0 });
  });

  it("waits, rather than handing work back, on a phone the farm took off its list", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    farm.refuses({
      code: "FORBIDDEN",
      message: "This phone is no longer one of the farm's: enroll it again",
      data: { refusal: "phone_revoked" },
    });

    await outbox.flush();

    expect(await outbox.state()).toMatchObject({
      paused: "signed_out",
      pending: 1,
      rejected: 0,
    });
  });

  it("sends only the signed-in person's work, leaving another's to wait for them", async () => {
    let signedIn = "rahim";
    const outbox = new Outbox({
      storage,
      transport: farm.transport,
      retry: new DefaultRetryPolicy(5, false),
      now: () => at,
      newKey: () => {
        keys += 1;
        return `key-${keys}`;
      },
      actorOf: () => signedIn,
      mayCarry: (entry) => entry.actorId === signedIn,
    });
    await outbox.add("step_completion", milk(11), "rahims");
    // Rahim signs out of the office computer with his milking still queued; Karim signs in.
    signedIn = "karim";
    await outbox.add("step_completion", milk(9), "karims");

    await outbox.flush();
    expect(
      farm.sends.map((one) => one.entries.map((entry) => entry.id))
    ).toEqual([["karims"]]);
    expect(await outbox.state()).toMatchObject({ pending: 1, rejected: 0 });

    signedIn = "rahim";
    await outbox.flush();
    expect(farm.sends.at(-1)?.entries.map((entry) => entry.id)).toEqual([
      "rahims",
    ]);
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

describe("putting right an entry still on the phone", () => {
  it("replaces what it says, keeping its number and time, and the farm only ever hears the corrected figure", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    const [before] = await outbox.pending();

    expect(
      await outbox.replaceWaiting("a", "step_completion", () => milk(1.1))
    ).toBe(true);
    const [after] = await outbox.pending();
    expect(after).toMatchObject({
      id: "a",
      seq: before?.seq,
      recordedAt: before?.recordedAt,
      body: { evidence: [1.1] },
    });
    await outbox.flush();
    expect(farm.sends.flatMap((sent) => sent.entries)).toMatchObject([
      { id: "a", evidence: [1.1] },
    ]);
  });

  it("is refused once the entry is on its way — frozen into a Batch the farm has not answered — or gone", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "a");
    farm.refuses(new Error("no route to host"));
    await outbox.flush();

    // The key carries exactly what was frozen: the figure is put right as a Correction sent behind it.
    expect(
      await outbox.replaceWaiting("a", "step_completion", () => milk(1.1))
    ).toBe(false);
    const [stillWaiting] = await outbox.pending();
    expect(stillWaiting?.body).toMatchObject({ evidence: [11] });
    expect(
      await outbox.replaceWaiting("never", "step_completion", () => milk(1.1))
    ).toBe(false);
  });
});

describe("recovering refused entries", () => {
  const reject = () =>
    farm.says((batch) => ({
      results: batch.entries.map((entry) => ({
        id: String(entry.id),
        seq: Number(entry.seq),
        outcome: "rejected" as const,
        refusal: { category: "not_yours" as const },
      })),
    }));

  it("keeps the original time, author and proof, but sends the edited answer under a new identity", async () => {
    const outbox = shedPhoneOn(() =>
      Promise.resolve(new Map([["pin-1", { token: "original-token" }]]))
    );
    await outbox.add("step_completion", milk(11), "original");
    reject();
    await outbox.flush();
    const rejected = await outbox.rejected();
    const original = rejected[0]?.entry;
    at = new Date("2027-02-02T05:00:00.000Z");
    const edited = {
      kind: "step_completion",
      body: milk(1.1),
      actorId: "someone-else",
      proof: "a-different-proof",
      recordedAt: at.toISOString(),
    } as const;
    const { id } = await outbox.recover("original", edited);
    const [replacement] = await outbox.pending();
    expect(id).not.toBe("original");
    expect(replacement).toMatchObject({
      id,
      recordedAt: original?.recordedAt,
      actorId: "staff-a",
      proof: "pin-1",
      body: { evidence: [1.1] },
    });
    expect(replacement?.seq).toBeGreaterThan(original?.seq ?? 0);
    expect(await outbox.rejected()).toEqual([]);
    farm.says(takesEverything);
    await outbox.flush();
    expect(farm.sends.at(-1)?.entries).toMatchObject([
      {
        id,
        recordedAt: original?.recordedAt,
        switchToken: "original-token",
        evidence: [1.1],
      },
    ]);
    expect(await outbox.pending()).toEqual([]);
  });

  it("refuses to change another person's record even on a phone allowed to send everybody's work", async () => {
    let actor = "staff-a";
    const outbox = new Outbox({
      storage,
      transport: farm.transport,
      retry: new DefaultRetryPolicy(),
      actorOf: () => actor,
      mayCarry: () => true,
    });
    await outbox.add(
      "observation",
      { tagNumber: "D-0001", saw: "limping" },
      "original"
    );
    reject();
    await outbox.flush();
    actor = "staff-b";
    const rejected = await outbox.rejected();
    expect(outbox.canRecover(rejected[0]?.entry ?? {})).toBe(false);
    await expect(
      outbox.recover("original", {
        kind: "observation",
        body: { tagNumber: "D-0001", saw: "other", note: "changed" },
      })
    ).rejects.toMatchObject({ why: "not_yours" });
    expect(await outbox.pending()).toEqual([]);
    expect(await outbox.rejected()).toHaveLength(1);
  });

  it("does not replace accepted work that is waiting for review, or change the kind of a refused entry", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "reviewed");
    farm.says((batch) => ({
      results: batch.entries.map((entry) => ({
        id: String(entry.id),
        seq: Number(entry.seq),
        outcome: "kept" as const,
      })),
    }));
    await outbox.flush();
    await expect(
      outbox.recover("reviewed", { kind: "step_completion", body: milk(9) })
    ).rejects.toBeInstanceOf(RecoveryError);
    expect(await outbox.reviewed()).toHaveLength(1);
    await outbox.add("instance_claim", { instanceId: "instance-1" }, "refused");
    reject();
    await outbox.flush();
    await expect(
      outbox.recover("refused", {
        kind: "instance_complete",
        body: { instanceId: "instance-1" },
      })
    ).rejects.toMatchObject({ why: "not_rejected" });
  });

  it("makes concurrent and stale-screen resubmissions one replacement, including after it has reached the farm", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "original");
    reject();
    await outbox.flush();
    const draft = { kind: "step_completion" as const, body: milk(9) };
    const ids = await Promise.all([
      outbox.recover("original", draft),
      outboxOn().recover("original", draft),
    ]);
    expect(new Set(ids.map((result) => result.id)).size).toBe(1);
    expect(await outbox.pending()).toHaveLength(1);
    farm.says(takesEverything);
    await outbox.flush();
    expect(await outboxOn().recover("original", draft)).toMatchObject({
      id: ids[0]?.id,
      created: false,
    });
    expect(await outbox.pending()).toEqual([]);
  });

  it("leaves the original intact if the atomic replacement write fails", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "original");
    reject();
    await outbox.flush();
    const write = storage.set.bind(storage);
    storage.set = (key, value) =>
      key.startsWith("recovery:")
        ? Promise.reject(new Error("storage full"))
        : write(key, value);
    await expect(
      outbox.recover("original", { kind: "step_completion", body: milk(9) })
    ).rejects.toThrow("storage full");
    expect(await outbox.pending()).toEqual([]);
    const rejected = await outbox.rejected();
    expect(rejected[0]?.entry.body).toMatchObject({
      evidence: [11],
    });
    storage.set = write;
    await outbox.recover("original", {
      kind: "step_completion",
      body: milk(9),
    });
    expect(await outbox.pending()).toHaveLength(1);
  });

  it("relinks the stored photo to the replacement parent and never sends the orphan again", async () => {
    const outbox = outboxOn();
    await outbox.add(
      "step_completion",
      { ...milk(11), photoSlots: [1] },
      "original"
    );
    await outbox.add(
      "completion_photo",
      {
        completionId: "original",
        slot: 1,
        contentType: "image/jpeg",
        data: "photo-data",
      },
      "photo"
    );
    farm.says((batch) => ({
      results: batch.entries.map((entry) => ({
        id: String(entry.id),
        seq: Number(entry.seq),
        outcome:
          entry.kind === "completion_photo"
            ? ("kept" as const)
            : ("rejected" as const),
      })),
    }));
    await outbox.flush();
    const photos = await outbox.photosFor("original");
    expect(photos).toEqual([
      { slot: 1, contentType: "image/jpeg", data: "photo-data" },
    ]);
    const { id } = await outbox.recover(
      "original",
      { kind: "step_completion", body: { ...milk(9), photoSlots: [1] } },
      photos
    );
    const waiting = await outbox.pending();
    expect(waiting).toHaveLength(2);
    expect(waiting[1]).toMatchObject({
      kind: "completion_photo",
      body: { completionId: id, slot: 1, data: "photo-data" },
    });
    expect(waiting[1]?.seq).toBeGreaterThan(waiting[0]?.seq ?? 0);
    expect(await outbox.reviewed()).toEqual([]);
    farm.says(takesEverything);
    await outbox.flush();
    expect(farm.sends.at(-1)?.entries.map((entry) => entry.id)).not.toContain(
      "photo"
    );
    expect(await outbox.pending()).toEqual([]);
    expect(
      [...storage.rows.keys()].some(
        (key) => key.startsWith("rejected:") || key.startsWith("needs-review:")
      )
    ).toBe(false);
  });

  it("will not silently lose an original photo that is no longer on the phone", async () => {
    const outbox = outboxOn();
    await outbox.add(
      "step_completion",
      { ...milk(11), photoSlots: [1] },
      "original"
    );
    reject();
    await outbox.flush();
    await expect(
      outbox.recover("original", { kind: "step_completion", body: milk(9) })
    ).rejects.toMatchObject({ why: "missing_photos" });
    expect(await outbox.rejected()).toHaveLength(1);
  });

  it("recovers bookkeeping after the phone dies while an accepted replacement is being cleared", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "original");
    reject();
    await outbox.flush();
    const { id } = await outbox.recover("original", {
      kind: "step_completion",
      body: milk(9),
    });
    farm.says(takesEverything);
    const failure = storage.failDeletesAfter(0);
    await expect(outbox.flush()).rejects.toThrow("the phone died");
    failure.stop();
    const sends = farm.sends.length;
    const restarted = outboxOn();
    await restarted.flush();
    expect(farm.sends).toHaveLength(sends);
    expect(await restarted.pending()).toEqual([]);
    expect(await restarted.rejected()).toEqual([]);
    expect(
      await restarted.recover("original", {
        kind: "step_completion",
        body: milk(9),
      })
    ).toMatchObject({ id, created: false });
  });

  it("keeps the oldest recording date visible when a recovered old entry is behind newer work", async () => {
    const outbox = outboxOn();
    await outbox.add("step_completion", milk(11), "old");
    const first = at.toISOString();
    reject();
    await outbox.flush();
    at = new Date("2027-02-03T05:00:00.000Z");
    await outbox.add("instance_claim", { instanceId: "new-work" }, "new");
    await outbox.recover("old", { kind: "step_completion", body: milk(9) });
    const state = await outbox.state();
    expect(state.oldestWaitingAt).toBe(first);
  });

  it("can recover a replacement refused again while its photos are still waiting, without carrying old copies", async () => {
    const outbox = outboxOn();
    await outbox.add(
      "step_completion",
      { ...milk(11), photoSlots: [1] },
      "original"
    );
    const recoveryPhoto = {
      slot: 1,
      contentType: "image/jpeg" as const,
      data: "photo-data",
    };
    await outbox.add(
      "completion_photo",
      { ...recoveryPhoto, completionId: "original" },
      "original-photo"
    );
    reject();
    await outbox.flush();
    const { id: first } = await outbox.recover(
      "original",
      { kind: "step_completion", body: milk(9) },
      [recoveryPhoto]
    );
    // A parent gets a verdict while its photo has no verdict yet and must keep waiting.
    farm.says((batch) => ({
      results: batch.entries
        .filter((entry) => entry.kind === "step_completion")
        .map((entry) => ({
          id: String(entry.id),
          seq: Number(entry.seq),
          outcome: "rejected" as const,
        })),
    }));
    await outbox.flush();
    expect(await outbox.pending()).toHaveLength(1);
    const { id: second } = await outbox.recover(
      first,
      { kind: "step_completion", body: milk(8) },
      await outbox.photosFor(first)
    );
    const waiting = await outbox.pending();
    expect(waiting).toHaveLength(2);
    expect(waiting[1]).toMatchObject({ body: { completionId: second } });
    farm.says(takesEverything);
    await outbox.flush();
    expect(await outbox.pending()).toEqual([]);
    expect(
      [...storage.rows.keys()].filter((key) => key.startsWith("recovery:"))
    ).toEqual([]);
  });
});

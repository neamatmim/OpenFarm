import { DefaultRetryPolicy } from "@tanstack/offline-transactions";
import type { StorageAdapter } from "@tanstack/offline-transactions";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Outbox } from "./outbox";

// A milker who sees she typed 11 L for 1.1 L puts it right from the phone, wherever the entry is (the Owner,
// 2026-10-07): still waiting on the phone, it is replaced there; already with the farm, the Correction is sent, or
// kept behind it with no signal.

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

let outbox: Outbox;
vi.mock("./outbox-client", () => ({ phoneOutbox: () => outbox }));
const { correctOnThePhone, recordStep } = await import("./record-offline");

const instanceKey = ["work", "instance-1"];
const milked = (liters: number) => ({
  instanceId: "instance-1",
  stepId: "milk",
  animalTag: "D-0001",
  animalId: "cow-1",
  evidence: [liters],
});
const fixOf = (id: string) => ({
  id,
  reason: "১১ নয়, ১.১",
  changes: {
    answer: {
      from: {
        skipReason: null,
        evidence: [11],
        destination: null,
        outOfRange: null,
      },
      to: { evidence: [1.1] },
    },
  },
});

let queryClient: QueryClient;
beforeEach(() => {
  outbox = new Outbox({
    storage: new MemoryStorage(),
    transport: { send: () => Promise.reject(new Error("not in this test")) },
    retry: new DefaultRetryPolicy(5, false),
  });
  queryClient = new QueryClient();
  queryClient.setQueryData(instanceKey, { completions: [] });
});

describe("a Step put right from the phone", () => {
  it("still waiting on the phone, is replaced there: the board shows it, and the farm will only hear 1.1", async () => {
    const id = await recordStep(queryClient, instanceKey, milked(11));
    const send = vi.fn();

    const done = await correctOnThePhone(queryClient, instanceKey, fixOf(id), {
      online: true,
      send,
      animalId: "cow-1",
    });

    expect(done.how).toBe("replaced");
    expect(send).not.toHaveBeenCalled();
    const waiting = await outbox.pending();
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.body).toMatchObject({
      instanceId: "instance-1",
      stepId: "milk",
      animalTag: "D-0001",
      evidence: [1.1],
    });
    expect(
      queryClient.getQueryData<{ completions: { evidence: unknown }[] }>(
        instanceKey
      )?.completions
    ).toMatchObject([{ id, evidence: [1.1] }]);
  });

  it("already with the farm, is sent; with no answer, kept behind the Step it puts right", async () => {
    const sent = vi.fn(() =>
      Promise.resolve({
        completionId: "on-the-farm",
        roleUsed: "staff",
        effect: null,
        needsReview: false,
      })
    );
    const sentWith = await correctOnThePhone(
      queryClient,
      instanceKey,
      fixOf("on-the-farm"),
      { online: true, send: sent as never, animalId: "cow-1" }
    );
    expect(sentWith.how).toBe("sent");

    const noAnswer = vi.fn(() =>
      Promise.reject(new TypeError("Failed to fetch"))
    );
    const keptWith = await correctOnThePhone(
      queryClient,
      instanceKey,
      fixOf("on-the-farm"),
      { online: true, send: noAnswer as never, animalId: "cow-1" }
    );
    expect(keptWith.how).toBe("kept");
    expect(await outbox.pending()).toMatchObject([
      {
        kind: "step_correction",
        body: { completionId: "on-the-farm", reason: "১১ নয়, ১.১" },
      },
    ]);
  });

  it("on its way in a Batch the farm has not answered, is kept behind it, never sent ahead of it", async () => {
    const id = await recordStep(queryClient, instanceKey, milked(11));
    // The phone froze a Batch over it and found no answer.
    await outbox.flush();
    const send = vi.fn();

    const done = await correctOnThePhone(queryClient, instanceKey, fixOf(id), {
      online: true,
      send,
      animalId: "cow-1",
    });

    expect(done.how).toBe("kept");
    expect(send).not.toHaveBeenCalled();
    const waiting = await outbox.pending();
    expect(waiting.map((entry) => entry.kind)).toEqual([
      "step_completion",
      "step_correction",
    ]);
  });
});

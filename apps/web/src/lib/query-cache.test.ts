import type { PersistedClient } from "@tanstack/query-persist-client-core";
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from "@tanstack/query-persist-client-core";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { animalPhotoKey } from "@/components/portal/animal-photo-key";
import { orpc } from "@/utils/orpc";

import {
  KEEP_AT_MOST_EVERY_MS,
  keptOnDevice,
  onDevice,
  readKept,
  shelvedInThisShape,
  writeKept,
  CACHE_SHAPE,
} from "./query-cache";

describe("the cache a phone keeps", () => {
  it("gives back a date as a date, however deep in an answer it sits", () => {
    const asOf = new Date("2026-09-14T04:00:00.000Z");
    const kept = {
      timestamp: 1,
      buster: "",
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ["inspector", "view"],
            queryHash: "view",
            state: { data: { herd: { asOf, total: 3 }, note: "$date" } },
          },
        ],
      },
    } as unknown as PersistedClient;

    const back = readKept(writeKept(kept));
    const data = back.clientState.queries[0]?.state.data as {
      herd: { asOf: unknown; total: number };
      note: string;
    };

    expect(data.herd.asOf).toBeInstanceOf(Date);
    expect(data.herd.asOf).toEqual(asOf);
    expect(data.herd.total).toBe(3);
    // A string that merely says "$date" is still a string.
    expect(data.note).toBe("$date");
  });
});

/** A question that answered, under the key the app's own client gives it. */
const answered = (queryKey: readonly unknown[]) => ({
  queryKey,
  state: { status: "success" },
});

describe("what a phone keeps", () => {
  it("keeps the farm's answers, for a shed with no signal", () => {
    expect(
      keptOnDevice(answered(orpc.animals.list.queryKey({ input: {} })), "farm")
    ).toBe(true);
  });

  it("keeps an Animal's thumbnail, and no photo whole", () => {
    expect(
      keptOnDevice(
        answered(
          orpc.animals.photo.queryKey({
            input: { tagNumber: "D-0001", size: "thumb" },
          })
        ),
        "farm"
      )
    ).toBe(true);
    for (const whole of [
      orpc.animals.photo.queryKey({ input: { tagNumber: "D-0001" } }),
      orpc.animals.deathPhotos.queryKey({ input: { tagNumber: "D-0001" } }),
      orpc.farm.certificate.queryKey({ input: {} }),
      orpc.money.receipt.queryKey({ input: { id: "e" } }),
    ]) {
      expect(keptOnDevice(answered(whole), "farm")).toBe(false);
    }
  });

  it("never keeps an Investor's, which would outlive their signing out", () => {
    expect(
      keptOnDevice(answered(orpc.portal.portfolio.queryKey()), "farm")
    ).toBe(false);
    expect(keptOnDevice(answered(orpc.portal.me.queryKey()), "farm")).toBe(
      false
    );
    expect(
      keptOnDevice(
        answered(orpc.portal.venture.queryKey({ input: { agreementId: "a" } })),
        "farm"
      )
    ).toBe(false);
  });

  it("never keeps an Investor's photographs, and keeps the Owner's Preview of them as the farm's own", () => {
    const input = { agreementId: "a", tagNumber: "F-0021" };
    const at = "2026-09-22T05:00:00.000Z";
    expect(
      keptOnDevice(
        answered(animalPhotoKey({ previewing: false, input, photoAt: at })),
        "farm"
      )
    ).toBe(false);
    expect(
      keptOnDevice(
        answered(
          animalPhotoKey({
            previewing: true,
            input: { ...input, investorId: "i" },
            photoAt: at,
          })
        ),
        "farm"
      )
    ).toBe(true);
  });

  it("never keeps a question that failed", () => {
    expect(
      keptOnDevice(
        {
          queryKey: orpc.animals.list.queryKey({ input: {} }),
          state: { status: "error" },
        },
        "farm"
      )
    ).toBe(false);
  });

  it("keeps nothing at all on the Investor address, whatever was asked", () => {
    // The portal's own origin (ADR 0009): a shared family phone keeps no answer of anybody's there.
    for (const queryKey of [
      orpc.animals.list.queryKey({ input: {} }),
      orpc.people.me.queryKey(),
      orpc.portal.portfolio.queryKey(),
      ["portal-front-door"],
    ]) {
      expect(keptOnDevice(answered(queryKey), "portal")).toBe(false);
    }
    expect(keptOnDevice(answered(orpc.people.me.queryKey()), "farm")).toBe(
      true
    );
  });
});

/** Screens put away under the shape named. */
const shelf = (buster: string): PersistedClient => ({
  timestamp: Date.now(),
  buster,
  clientState: { queries: [], mutations: [] },
});

describe("a person's screens put away on a Shed Phone", () => {
  it("is brought back when it was put away in the shape the phone reads now", () => {
    expect(shelvedInThisShape(shelf(CACHE_SHAPE))).toBe(true);
  });

  it("is not brought back when it was put away before the shape changed", () => {
    // Put away before an update, brought back after it: a screen drawn from it would have no figures to write out.
    expect(shelvedInThisShape(shelf(""))).toBe(false);
    expect(shelvedInThisShape(shelf("kept-the-old-way"))).toBe(false);
  });
});

/** The device's database, held in memory: what a test keeps and reads back goes through the same persister. */
const memoryStorage = (): Parameters<typeof onDevice>[0] => {
  const kept = new Map<string, unknown>();
  return {
    get: (key: string) => Promise.resolve(kept.get(key) ?? null),
    set: (key: string, value: unknown) => {
      kept.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      kept.delete(key);
      return Promise.resolve();
    },
  } as Parameters<typeof onDevice>[0];
};

/** As the app counts an answer fresh: for a minute after it came. */
const FRESH_FOR_MS = 60 * 1000;

describe("a reload", () => {
  it("draws what was kept at once, and asks the farm again however fresh it was when kept", async () => {
    // Read a moment ago on this phone; since then somebody else recorded a draw on theirs.
    const storage = memoryStorage();
    const before = new QueryClient();
    before.setQueryData(["openDraws"], ["Test worker ৳2,500"]);
    vi.useFakeTimers();
    await persistQueryClientSave({
      queryClient: before,
      persister: onDevice(storage),
    });
    // Written out once the moment passes, as on a phone a second after the page settles.
    await vi.advanceTimersByTimeAsync(KEEP_AT_MOST_EVERY_MS);
    vi.useRealTimers();

    const reloaded = new QueryClient();
    await persistQueryClientRestore({
      queryClient: reloaded,
      persister: onDevice(storage),
    });
    const asked = vi.fn(() => Promise.resolve(["Test worker ৳2,600"]));
    const screen = new QueryObserver(reloaded, {
      queryKey: ["openDraws"],
      queryFn: asked,
      staleTime: FRESH_FOR_MS,
    });
    const drawnFirst = screen.getCurrentResult().data;
    const stop = screen.subscribe(() => null);

    await vi.waitFor(() =>
      expect(screen.getCurrentResult().data).toEqual(["Test worker ৳2,600"])
    );
    stop();
    expect(drawnFirst).toEqual(["Test worker ৳2,500"]);
    expect(asked).toHaveBeenCalledOnce();
  });
});

/** A kept cache with nothing in it, told apart by when it was taken. */
const keptAt = (timestamp: number): PersistedClient => ({
  timestamp,
  buster: "",
  clientState: { mutations: [], queries: [] },
});

describe("writing the cache out", () => {
  it("writes a burst of changes once, as they stand at the end", async () => {
    vi.useFakeTimers();
    const written: string[] = [];
    const storage = {
      ...memoryStorage(),
      set: (_key: string, value: unknown) => {
        written.push(String(value));
        return Promise.resolve();
      },
    } as Parameters<typeof onDevice>[0];
    const persister = onDevice(storage, 1000);
    await Promise.all(
      Array.from({ length: 20 }, (_, change) =>
        persister.persistClient(keptAt(change + 1))
      )
    );
    const beforeTheSecond = written.length;
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();

    expect(beforeTheSecond).toBe(0);
    expect(written).toHaveLength(1);
    expect(readKept(written[0] ?? "").timestamp).toBe(20);
  });
});

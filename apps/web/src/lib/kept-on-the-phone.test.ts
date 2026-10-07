import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { setTimeout as after } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { ORPCError } from "@orpc/client";
import {
  MutationObserver,
  QueryClient,
  onlineManager,
} from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./outbox-client", () => ({ phoneOutbox: () => null }));

const { keptOnThePhone, sendOrKeep } = await import("./record-offline");

// The shed's work is written to the phone first, whatever the network says (ADR 0002). React Query parks a mutation
// while the browser says it is offline — which it does on walking into a shed with no coverage — so a save that only
// writes to the phone has to say it runs anyway, or the tap is never written down.

afterEach(() => {
  onlineManager.setOnline(true);
});

/** Runs a mutation with the app's options, offline, and says how many times its work ran. */
const offlineRuns = async (options: object) => {
  onlineManager.setOnline(false);
  let ran = 0;
  const observer = new MutationObserver(new QueryClient(), {
    ...options,
    mutationFn: () => {
      ran += 1;
      return Promise.resolve();
    },
  });
  void observer.mutate().catch(() => null);
  await after(20);
  return { ran, paused: observer.getCurrentResult().isPaused };
};

/** Every file under a folder. */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? files(file) : [file];
  });

describe("a save that writes only to the phone", () => {
  it("runs with no signal, where React Query's default would park it unseen", async () => {
    expect(await offlineRuns({})).toEqual({ ran: 0, paused: true });
    expect(await offlineRuns(keptOnThePhone)).toEqual({
      ran: 1,
      paused: false,
    });
  });

  it("is so on every screen that writes the shed's work to the phone", () => {
    const src = fileURLToPath(new URL("..", import.meta.url));
    // A screen that saves the shed's work through a React Query mutation; one that awaits it by hand is not parked.
    const writers = files(src).filter((file) => {
      const text = readFileSync(file, "utf-8");
      return (
        file.endsWith(".tsx") &&
        text.includes("useMutation(") &&
        /\b(?:recordStep|claimInstance|finishInstance|sendOrKeep)\(/u.test(text)
      );
    });
    expect(writers.length).toBeGreaterThan(3);
    const without = writers.filter(
      (file) => !readFileSync(file, "utf-8").includes("keptOnThePhone")
    );
    expect(without).toEqual([]);
  });
});

describe("a sighting or a Move", () => {
  const kept: string[] = [];
  const keep = () => {
    kept.push("kept");
    return Promise.resolve();
  };

  it("is kept on the phone with no signal, and when the farm never answered though the phone had bars", async () => {
    kept.length = 0;
    const send = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(
      await sendOrKeep({ online: false, send: () => Promise.resolve(), keep })
    ).toBe("kept");
    expect(await sendOrKeep({ online: true, send, keep })).toBe("kept");
    expect(kept).toEqual(["kept", "kept"]);
  });

  it("is sent when the farm answers, and a refusal is said, not kept to be refused again later", async () => {
    kept.length = 0;
    expect(
      await sendOrKeep({ online: true, send: () => Promise.resolve(), keep })
    ).toBe("sent");
    await expect(
      sendOrKeep({
        online: true,
        send: () =>
          Promise.reject(
            new ORPCError("BAD_REQUEST", { data: { refusal: "pen_full" } })
          ),
        keep,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(kept).toEqual([]);
  });
});

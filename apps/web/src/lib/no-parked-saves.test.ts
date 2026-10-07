import { MutationObserver, onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import { createQueryClient } from "@/utils/orpc";

// A form saved with no signal is never parked to go later, unseen, behind a spinner: it fails at once, the reader is
// told it was not saved, and the form stays open with what was typed (the Owner, 2026-10-07).

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("a save on the app's own client, with no signal", () => {
  it("is tried at once rather than parked", async () => {
    onlineManager.setOnline(false);
    let tried = 0;
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: () => {
        tried += 1;
        return Promise.reject(new TypeError("Failed to fetch"));
      },
    });
    await observer.mutate().catch(() => null);
    expect(tried).toBe(1);
    expect(observer.getCurrentResult()).toMatchObject({
      isPaused: false,
      status: "error",
    });
  });
});

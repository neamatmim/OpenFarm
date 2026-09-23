import { describe, expect, it } from "vitest";

import { HERD_EVERY_MS, herdReadIsDue } from "./herd-refresh";

const NOW = Date.parse("2026-09-23T08:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("when the phone reads the herd again", () => {
  it("reads at once when it has never read it", () => {
    expect(herdReadIsDue({ readAt: null, triedAt: null, now: NOW })).toBe(true);
  });

  it("waits out the spacing after a read that answered", () => {
    expect(
      herdReadIsDue({ readAt: ago(60_000), triedAt: null, now: NOW })
    ).toBe(false);
    expect(
      herdReadIsDue({
        readAt: ago(HERD_EVERY_MS + 1000),
        triedAt: null,
        now: NOW,
      })
    ).toBe(true);
  });

  // The farm refuses a person holding no Role yet, and a shed has no signal. Neither answer is the herd, and
  // asking again on the next tick is a phone asking four times a minute for as long as the app is open.
  it("waits out the spacing after a read that did not answer", () => {
    expect(
      herdReadIsDue({ readAt: null, triedAt: ago(15_000), now: NOW })
    ).toBe(false);
    expect(
      herdReadIsDue({
        readAt: null,
        triedAt: ago(HERD_EVERY_MS + 1000),
        now: NOW,
      })
    ).toBe(true);
  });

  it("counts from whichever happened later", () => {
    expect(
      herdReadIsDue({
        readAt: ago(HERD_EVERY_MS + 1000),
        triedAt: ago(30_000),
        now: NOW,
      })
    ).toBe(false);
  });

  // A phone whose clock jumped back would otherwise hold off for as long as the jump lasted.
  it("reads when what it kept is dated ahead of now", () => {
    expect(
      herdReadIsDue({
        readAt: new Date(NOW + 60 * 60_000).toISOString(),
        triedAt: null,
        now: NOW,
      })
    ).toBe(true);
  });
});

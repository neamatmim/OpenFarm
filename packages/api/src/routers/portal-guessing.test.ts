import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { CODE_ATTEMPTS } from "../attempts";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The portal's one public door, `portal.join`, under a script's guessing (the exposure review, 1.2): wrong codes are
// counted against whoever is calling, so a script that names a new phone every time is stopped — and never against
// the phone, so strangers cannot keep an Investor out of their own invitation (the server survey, 2026-10-07).

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2055-01-01T04:00:00.000Z";
const clock = () => new FakeClock(JANUARY);
const SCRIPT = `203.0.113.${Number(suffix) % 250}`;

const from = async (caller: string) => {
  const { client } = await createTestClient(appRouter, {
    as: null,
    clock: clock(),
    from: caller,
  });
  return client;
};

beforeAll(async () => {
  const { client: owner } = await createTestClient(appRouter, {
    as: "owner",
    clock: clock(),
  });
  await owner.investors.setPortalOpen({ open: true });
});

describe("guessing codes at the portal's door", () => {
  it("stops one caller that names a new phone every time, and nobody else", async () => {
    const script = await from(SCRIPT);
    for (let at = 0; at < CODE_ATTEMPTS.limit; at += 1) {
      // Sequential: each wrong guess is counted before the next.
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        script.portal.join({
          phone: `019${suffix}${String(at).padStart(2, "0")}`,
          code: "WRONGCOD",
          password: "gorur-khamar-2026",
        })
      ).rejects.toMatchObject({ data: { refusal: "wrong_code" } });
    }

    await expect(
      script.portal.join({
        phone: `019${suffix}99`,
        code: "WRONGCOD",
        password: "gorur-khamar-2026",
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const somebodyElse = await from("198.51.100.20");
    await expect(
      somebodyElse.portal.join({
        phone: `019${suffix}98`,
        code: "WRONGCOD",
        password: "gorur-khamar-2026",
      })
    ).rejects.toMatchObject({ data: { refusal: "wrong_code" } });
  });
});

/** What one try was answered with: the refusal's word, the error's code, or taken. */
const wordOf = (one: PromiseSettledResult<unknown>) =>
  one.status === "rejected"
    ? ((one.reason as { data?: { refusal?: string }; code?: string }).data
        ?.refusal ?? (one.reason as { code?: string }).code)
    : "taken";

describe("guesses sent all at once", () => {
  it("are counted as surely as one after another: no more wrong codes are answered than the caller's limit", async () => {
    const phone = `019${suffix}77`;
    const script = await from(`192.0.2.${Number(suffix) % 250}`);
    const answers = await Promise.allSettled(
      Array.from({ length: CODE_ATTEMPTS.limit * 4 }, () =>
        script.portal.join({
          phone,
          code: "WRONGCOD",
          password: "gorur-khamar-2026",
        })
      )
    );
    const words = answers.map(wordOf);
    expect(words.filter((word) => word === "wrong_code").length).toBe(
      CODE_ATTEMPTS.limit
    );
    expect(words.filter((word) => word === "TOO_MANY_REQUESTS").length).toBe(
      CODE_ATTEMPTS.limit * 3
    );
  });
});

describe("an Investor's own code, after strangers guessed at it", () => {
  it("still lets them in: wrong codes from other callers never shut their phone out", async () => {
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock: clock(),
    });
    const phone = `018${suffix}55`;
    const them = await owner.investors.record({
      name: `রহিমা ${suffix}`,
      phone,
      address: "সাভার",
    });
    await owner.investors.recordConsent({ id: them.id });
    const { code } = await owner.investors.inviteToPortal({ id: them.id });
    for (let at = 0; at < CODE_ATTEMPTS.limit; at += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one stranger after another
      const stranger = await from(`198.18.${at}.${Number(suffix) % 250}`);
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        stranger.portal.join({
          phone,
          code: "WRONGCOD",
          password: "gorur-khamar-2026",
        })
      ).rejects.toMatchObject({ data: { refusal: "wrong_code" } });
    }
    const theirOwn = await from("198.51.100.77");
    await expect(
      theirOwn.portal.join({ phone, code, password: "gorur-khamar-2026" })
    ).resolves.toMatchObject({ loginEmail: expect.any(String) });
  });
});

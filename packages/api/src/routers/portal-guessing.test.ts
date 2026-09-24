import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { CODE_ATTEMPTS } from "../attempts";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The portal's one public door, `portal.join`, under a script's guessing (the exposure review, 1.2): wrong codes are
// counted against whoever is calling as well as the phone they name, so a script that names a new phone every time
// is still stopped.

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

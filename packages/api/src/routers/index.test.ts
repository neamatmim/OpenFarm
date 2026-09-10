import { DAY, FakeClock, MINUTE } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

describe("appRouter through the in-process client", () => {
  it("answers the health check for the Owner", async () => {
    const { client } = await createTestClient(appRouter, { as: "owner" });

    expect(await client.healthCheck()).toBe("OK");
  });

  it("returns the caller's own user on privateData", async () => {
    const { client } = await createTestClient(appRouter, { as: "manager" });

    const result = await client.privateData();

    expect(result.message).toBe("This is private");
    expect(result.user?.name).toBe("ম্যানেজার");
  });

  it("refuses privateData to an unauthenticated caller", async () => {
    const { client } = await createTestClient(appRouter, { as: null });

    await expect(client.privateData()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("refuses a session that has expired on the injected clock", async () => {
    const { client, clock } = await createTestClient(appRouter, {
      as: "owner",
    });

    clock.advance(8 * DAY);

    await expect(client.privateData()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("reads time from the injected clock, not the wall clock", async () => {
    const clock = new FakeClock("2026-09-11T05:00:00.000Z");
    const { client } = await createTestClient(appRouter, {
      as: "staff",
      clock,
    });

    clock.advance(90 * MINUTE);

    expect(await client.serverTime()).toEqual(
      new Date("2026-09-11T06:30:00.000Z")
    );
  });
});

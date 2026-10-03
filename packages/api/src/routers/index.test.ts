import { DAY } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

describe("appRouter through the in-process client", () => {
  it("answers the health check for the Owner", async () => {
    const { client } = await createTestClient(appRouter, { as: "owner" });

    expect(await client.healthCheck()).toBe("OK");
  });

  it("refuses a signed-in procedure to an unauthenticated caller", async () => {
    const { client } = await createTestClient(appRouter, { as: null });

    await expect(client.alerts.mine({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("refuses a session that has expired on the injected clock", async () => {
    const { client, clock } = await createTestClient(appRouter, {
      as: "owner",
    });

    clock.advance(8 * DAY);

    await expect(client.alerts.mine({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

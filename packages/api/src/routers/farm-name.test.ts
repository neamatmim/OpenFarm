import { scratchDb, theFarm } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The farm's name is typed once, when the first account sets the farm up, and prints on every paper that leaves it. A
 * slip of the keyboard then was there for good. The Owner puts it right; the trail keeps what it said before, because
 * the papers already sent out said that.
 */
describe("the farm's name", () => {
  it("is put right by the Owner, with what it said before on the trail", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const was = await owner.client.farm.identity();
    const before = was.name;
    await owner.client.farm.rename({ name: "  সবুজ মাঠ ডেইরি  " });
    // The next request reads the farm afresh.
    const next = await createTestClient(appRouter, { as: "owner" });
    const now = await next.client.farm.identity();
    expect(now.name).toBe("সবুজ মাঠ ডেইরি");

    const trail = await scratchDb().query.auditEvent.findFirst({
      where: { farmId: theFarm().id, entity: "farm", action: "update" },
      orderBy: { receivedAt: "desc", id: "desc" },
      columns: { before: true, after: true },
    });
    expect(trail).toMatchObject({
      before: { name: before },
      after: { name: "সবুজ মাঠ ডেইরি" },
    });
    await owner.client.farm.rename({ name: before });
  });

  it("is the Owner's alone, and never nothing", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    await expect(
      manager.client.farm.rename({ name: "আরেক নাম" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const owner = await createTestClient(appRouter, { as: "owner" });
    await expect(
      owner.client.farm.rename({ name: "   " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

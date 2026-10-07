import { alert } from "@OpenFarm/db/schema/alert";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Role taken away takes what came with it, as ending a Membership does: a Manager made Barn Staff went on reading
// buyers' debts in his list.

const suffix = `${Date.now()}`;
const NOW = "2095-01-10T04:00:00.000Z";

describe("a Role taken away", () => {
  it("clears the notices only that Role was told, and leaves those told for what they do", async () => {
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock(NOW),
    });
    await createTestClient(appRouter, { as: "manager" });
    const manager = thePerson("manager").id;
    const notice = (kind: "receivable_overdue" | "entry_rejected") => ({
      id: `${kind}-${suffix}`,
      farmId: theFarm().id,
      userId: manager,
      kind,
      entity: "sync_entry",
      entityId: `${kind}-about-${suffix}`,
      params: {},
      createdAt: new Date(NOW),
    });
    await scratchDb()
      .insert(alert)
      .values([notice("receivable_overdue"), notice("entry_rejected")]);

    await owner.client.people.assignRoles({
      userId: manager,
      roles: ["staff"],
    });

    const after = await scratchDb().query.alert.findMany({
      where: { userId: manager, entityId: { like: `%-about-${suffix}` } },
      columns: { kind: true, dismissedAt: true },
    });
    const showing = after
      .filter((one) => one.dismissedAt === null)
      .map((one) => one.kind);
    // A buyer's debt is the Owner's and the Manager's alone; an entry the farm sent back is whoever wrote it's.
    expect(showing).toEqual(["entry_rejected"]);
  });
});

import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Year Change withdrawn is judged behind the farm lock, as recording one is: sent twice at once, one withdrawal stands
// and the other is told there is no change left to withdraw — not two withdrawals on the trail.

describe("a Year Change withdrawn twice at once", () => {
  it("is withdrawn once, with one event on the trail", async () => {
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2026-10-05T04:00:00.000Z"),
    });
    const { id } = await owner.financialYears.recordChange({
      changingFrom: "2027-07",
      newFrom: "2028-04",
      reason: "Finance Act",
    });

    const sent = await Promise.allSettled(
      [1, 2].map(() =>
        owner.financialYears.withdrawChange({
          changeId: id,
          reason: "Recorded before the law was passed",
        })
      )
    );

    expect(sent.map((one) => one.status).toSorted()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const trail = await scratchDb().query.auditEvent.findMany({
      where: { entityId: id, action: "update" },
      columns: { id: true },
    });
    expect(trail).toHaveLength(1);
  });
});

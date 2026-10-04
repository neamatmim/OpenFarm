import { scratchDb, thePerson } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Approval Threshold and the Manager's own Correction Window are checks on the Manager, so they are the Owner's to
// set; and the Owner hears when the Manager changes any other setting (the Owner's decision of 2026-10-04).

const toldOfSettings = async () =>
  await scratchDb().query.alert.findMany({
    where: { kind: "settings_changed", userId: thePerson("owner").id },
    columns: { params: true },
  });

describe("the checks on the Manager", () => {
  it("are the Owner's to set, not his", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    for (const asked of [
      { approvalThresholdMoney: 100_000_000 },
      { managerCorrectionDays: 365 },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one ask after another
      await expect(
        manager.client.farm.setParameters(asked)
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        data: { refusal: "owner_only" },
      });
    }
    const owner = await createTestClient(appRouter, { as: "owner" });
    await expect(
      owner.client.farm.setParameters({ approvalThresholdMoney: 20_000 })
    ).resolves.toBeDefined();
  });

  it("tells the Owner when the Manager changes the farm's settings, and not when the Owner does", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.farm.setParameters({ milkTolerancePercent: 6 });
    expect(await toldOfSettings()).toEqual([]);

    const manager = await createTestClient(appRouter, { as: "manager" });
    await manager.client.farm.setParameters({
      milkTolerancePercent: 9,
      staffCorrectionHours: 6,
    });
    expect(await toldOfSettings()).toEqual([
      {
        params: expect.objectContaining({
          name: thePerson("manager").name,
          count: 2,
        }),
      },
    ]);
  });
});

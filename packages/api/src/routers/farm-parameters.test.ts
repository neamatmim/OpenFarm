import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Farm Parameters that hang together are judged against the farm as it stands when they are saved, behind the farm's
// lock — not as each person's screen read it — and each refusal carries its word, so a Bangla screen says it in Bangla.

const as = (role: "owner" | "manager") =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock("2087-01-10T04:00:00.000Z"),
  });

describe("the AI window, saved by two people at once", () => {
  it("is never left shutting before it opens", async () => {
    // Both read the farm with the window at 12 to 18.
    const manager = await as("manager");
    const owner = await as("owner");
    await manager.client.farm.setParameters({ aiWindowStartHours: 17 });
    // The Owner's screen still says it opens at 12: an end at 16 looked fine to her.
    await expect(
      owner.client.farm.setParameters({ aiWindowEndHours: 16 })
    ).rejects.toMatchObject({ data: { refusal: "ai_window_backwards" } });
    const after = await as("owner");
    const farm = await after.client.farm.current();
    expect(farm).toMatchObject({
      aiWindowStartHours: 17,
      aiWindowEndHours: 18,
    });
    await after.client.farm.setParameters({ aiWindowStartHours: 12 });
  });
});

describe("a Parameter refused", () => {
  it("says why in a word the screen can put into Bangla", async () => {
    const owner = await as("owner");
    for (const [sent, refusal] of [
      [{ aiWindowStartHours: 10, aiWindowEndHours: 9 }, "ai_window_backwards"],
      [{ quietFrom: "22:00", quietUntil: "22:00" }, "quiet_hours_same"],
      [{ quietFrom: "6:00" }, "not_a_time_of_day"],
      [{ investorCap: 10, investorWarnAt: 12 }, "investor_warning_after_cap"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await expect(owner.client.farm.setParameters(sent)).rejects.toMatchObject(
        { data: { refusal } }
      );
    }
  });
});

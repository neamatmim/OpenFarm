import { uuidv7 } from "@OpenFarm/db/ids";
import { backupRun } from "@OpenFarm/db/schema/backup";
import { DAY, FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** One attempt, as the nightly job writes it. */
const attempt = async (at: Date, ok: "yes" | "no", detail?: string) => {
  const id = uuidv7(at);
  await scratchDb()
    .insert(backupRun)
    .values({
      id,
      kind: "nightly",
      startedAt: at,
      finishedAt: at,
      destination: "offsite:openfarm",
      ok,
      detail: detail ?? null,
    });
  return id;
};

describe("whether the farm is being copied", () => {
  it("says when the last copy that worked was, and shows the ones that did not", async () => {
    const clock = new FakeClock("2027-04-02T06:00:00.000Z");
    const lastNight = new Date(clock.now().getTime() - DAY);
    const good = await attempt(lastNight, "yes");
    const bad = await attempt(
      new Date(clock.now().getTime() - 2 * DAY),
      "no",
      "upload to offsite:openfarm failed"
    );
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
    });

    const state = await manager.client.backups.recent({});

    expect(state.daysSince).toBe(1);
    expect(state.lastGoodAt).toEqual(lastNight);
    // A copy that failed is shown, not hidden: silence is what nobody notices.
    const seen = state.runs.filter((run) => [good, bad].includes(run.id));
    expect(seen.map((run) => run.ok).toSorted()).toEqual(["no", "yes"]);
    expect(seen.find((run) => run.id === bad)?.detail).toContain("upload");
  });

  it("is the Owner's and the Manager's business, not everyone's", async () => {
    const staff = await createTestClient(appRouter, { as: "staff" });

    await expect(staff.client.backups.recent({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

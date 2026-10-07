import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { buildContext } from "./context";
import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";
import type { Turning } from "./the-day-turns";
import { theDayTurns } from "./the-day-turns";

// A standard procedure adopted before the farm kept which standard each procedure is, known then only by its name: the
// day's turn writes down which it is while its name still says so, so renaming it later does not bring the standard
// back on offer, nor let it be adopted a second time.

const AT = "2073-04-02T03:00:00.000Z";

const turnTheDay = async () => {
  const context = await buildContext({
    session: null,
    clock: new FakeClock(AT),
    db: scratchDb(),
    farmId: theFarm().id,
  });
  const { farm } = context;
  if (!farm) {
    throw new Error("expected the test farm");
  }
  return await theDayTurns({ ...context, farm } as Turning);
};

describe("a standard procedure adopted before the farm kept which it is", () => {
  it("is known as that standard once the day turns, renamed or not", async () => {
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock(AT),
    });
    const { feeding } = standardPlaybook();
    // Adopted as the farm did before: by its content alone.
    const old = await owner.sops.create({ content: feeding });

    await turnTheDay();

    const listed = await owner.sops.list();
    expect(listed.find((one) => one.id === old.definitionId)?.standardKey).toBe(
      "feeding"
    );
    await owner.sops.publish({
      definitionId: old.definitionId,
      content: { ...feeding, name: { bn: "আমাদের খাওয়ানো" } },
    });
    await expect(
      owner.sops.create({ content: feeding, standardKey: "feeding" })
    ).rejects.toMatchObject({ data: { refusal: "sop_standard_adopted" } });
  });
});

import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Settlement is the end of a run. Nothing about it asks whether the run happened.
 *
 * `whatBlocksIt` counts animals still standing, prices missing, Floats open, Reimbursements owed and
 * months the bank has not agreed — every one of which a Venture that has never bought anything passes,
 * because it has none of them. And approving one freezes the Venture against every other act.
 */
const suffix = `settling-too-soon-${Date.now()}`;

const as = (instant: string) =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 700_000,
  decideBy: "2046-09-20",
  targetWindowStart: "2047-05-17",
  targetWindowEnd: "2047-05-19",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 750_000,
};

describe("a Venture that has not run", () => {
  it("is not something the farm can settle", async () => {
    const owner = await as("2046-09-03T04:00:00.000Z");
    const venture = await owner.client.ventures.open({
      name: `ঈদ ২০৪৭ ${suffix}`,
      ...plan,
    });

    // Open, nobody signed, nothing bought, not a taka in or out.
    const [standing] = (await owner.client.ventures.list()).filter(
      (one) => one.id === venture.id
    );
    expect(standing).toMatchObject({ state: "open" });

    // The farm should say why it cannot be settled, rather than settling it.
    const worked = await owner.client.ventures.settlement({
      ventureId: venture.id,
    });
    expect(worked.blocks).not.toEqual([]);

    await expect(
      owner.client.ventures.approveSettlement({ ventureId: venture.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // And it is still Open afterwards, taking capital as it was before anybody asked.
    const [after] = (await owner.client.ventures.list()).filter(
      (one) => one.id === venture.id
    );
    expect(after).toMatchObject({ state: "open" });
  });
});

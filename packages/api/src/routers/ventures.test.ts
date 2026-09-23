import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Venture: one investor-funded run of fattening cattle. It opens on a plan — a target, a Floor, a day to
 * decide by, a window, Units and two budgets — and nothing pays into it yet.
 */
const suffix = `venture-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const opening = {
  targetCapitalBdt: 2_000_000,
  floorBdt: 1_400_000,
  decideBy: "2044-08-15",
  targetWindowStart: "2045-05-17",
  targetWindowEnd: "2045-05-19",
  unitPriceBdt: 50_000,
  units: 40,
  cattleBudgetBdt: 1_500_000,
};

let first = "";

beforeAll(async () => {
  const owner = await as("owner", "2044-08-01T04:00:00.000Z");
  const made = await owner.client.ventures.open({
    name: `ঈদ ২০৪৫ ${suffix}`,
    ...opening,
  });
  first = made.id;
});

describe("a Venture", () => {
  it("opens on a plan, and reads back what the farm is looking for", async () => {
    const owner = await as("owner", "2044-08-02T04:00:00.000Z");
    const mine = await owner.client.ventures.list();
    const ours = mine.find((one) => one.id === first);
    expect(ours).toMatchObject({
      name: `ঈদ ২০৪৫ ${suffix}`,
      state: "open",
      targetCapitalBdt: 2_000_000,
      floorBdt: 1_400_000,
      unitPriceBdt: 50_000,
      units: 40,
      cattleBudgetBdt: 1_500_000,
      // What is not for cattle is for keeping them.
      runningBudgetBdt: 500_000,
      capitalInBdt: 0,
    });
  });

  it("refuses to start buying while the capital is under the Floor", async () => {
    const owner = await as("owner", "2044-08-16T04:00:00.000Z");
    await expect(
      owner.client.ventures.startBuying({ id: first })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // A Venture whose Floor is nothing may start buying at once: the two moves the Owner makes by hand are
  // proved here, where the capital ticket's absence cannot hide them.
  it("goes Open → Buying → Fattening, and no further by hand", async () => {
    const owner = await as("owner", "2044-08-17T04:00:00.000Z");
    const free = await owner.client.ventures.open({
      name: `মেঝে নেই ${suffix}`,
      ...opening,
      floorBdt: 0,
    });
    expect(await owner.client.ventures.startBuying({ id: free.id })).toEqual({
      state: "buying",
    });
    expect(await owner.client.ventures.startFattening({ id: free.id })).toEqual(
      { state: "fattening" }
    );
    // And no further: Selling and Settled are what the farm does, not what the Owner says.
    await expect(
      owner.client.ventures.startBuying({ id: free.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is not called off once it is buying", async () => {
    const owner = await as("owner", "2044-08-18T04:00:00.000Z");
    const buying = await owner.client.ventures.open({
      name: `কেনা শুরু ${suffix}`,
      ...opening,
      floorBdt: 0,
    });
    await owner.client.ventures.startBuying({ id: buying.id });
    await expect(
      owner.client.ventures.cancel({
        id: buying.id,
        reason: "মত বদলেছে",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is called off from Open, and never once it is buying", async () => {
    const owner = await as("owner", "2044-08-20T04:00:00.000Z");
    const called = await owner.client.ventures.open({
      name: `বাতিল ${suffix}`,
      ...opening,
    });
    await owner.client.ventures.cancel({
      id: called.id,
      reason: "যথেষ্ট টাকা ওঠেনি",
    });
    const mine = await owner.client.ventures.list();
    expect(mine.find((one) => one.id === called.id)).toMatchObject({
      state: "cancelled",
    });
    // Nothing moves out of Cancelled.
    await expect(
      owner.client.ventures.startBuying({ id: called.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps its plan within itself: a Floor above the target is refused", async () => {
    const owner = await as("owner", "2044-08-21T04:00:00.000Z");
    await expect(
      owner.client.ventures.open({
        name: `ভুল পরিকল্পনা ${suffix}`,
        ...opening,
        floorBdt: 2_500_000,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // And a Cattle Budget that outruns the capital it is planned from.
    await expect(
      owner.client.ventures.open({
        name: `ভুল বাজেট ${suffix}`,
        ...opening,
        cattleBudgetBdt: 2_400_000,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a Floor its Units could never raise", async () => {
    // Ten Units at fifty thousand hold five lakh at the most — capital beyond what the Units are worth is
    // refused — so a Floor of fourteen lakh would keep it Open for ever, the button to start buying dim
    // for a reason no signature could ever answer.
    const owner = await as("owner", "2044-08-21T05:00:00.000Z");
    await expect(
      owner.client.ventures.open({
        name: `অসম্ভব সীমা ${suffix}`,
        ...opening,
        units: 10,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_floor_over_units" },
    });
  });

  it("is the Owner's alone, and nobody else sees a Venture at all", async () => {
    const others = await Promise.all(
      (["manager", "staff", "vet"] as const).map((role) =>
        as(role, "2044-08-22T04:00:00.000Z")
      )
    );
    await Promise.all(
      others.map((other) =>
        expect(other.client.ventures.list()).rejects.toMatchObject({
          code: "FORBIDDEN",
        })
      )
    );
  });

  it("keeps a Venture nobody has bought for off the Manager's list", async () => {
    // It is still Open: it has taken no money and bought no animal, so there is nothing on it he can
    // look after today. He may ask, and is told about nothing.
    const manager = await as("manager", "2044-08-22T06:00:00.000Z");
    const running = await manager.client.ventures.running();
    expect(running.map((one) => one.id)).not.toContain(first);
    // Not because the list is empty — the ones that did start buying are on it.
    expect(running.length).toBeGreaterThan(0);
    // And it is still not the Barn Staff's or the Vet's business that Ventures exist at all.
    const others = await Promise.all(
      (["staff", "vet"] as const).map((role) =>
        as(role, "2044-08-22T07:00:00.000Z")
      )
    );
    await Promise.all(
      others.map((other) =>
        expect(other.client.ventures.running()).rejects.toMatchObject({
          code: "FORBIDDEN",
        })
      )
    );
  });

  it("leaves the trail with what it said before and after", async () => {
    const owner = await as("owner", "2044-08-23T04:00:00.000Z");
    const trail = await owner.client.audit.list({
      entity: "venture",
      entityId: first,
    });
    expect(trail.at(-1)).toMatchObject({
      action: "create",
      roleUsed: "owner",
    });
  });

  it("starts a new Agreement's split at a figure the Owner sets, not one in the code", async () => {
    // Story 100: an adviser's answer should be a setting rather than a release. The split is the figure
    // most likely to come back changed, and it was the one Parameter of the six that did not exist.
    const owner = await as("owner", "2044-08-24T04:00:00.000Z");
    const asItStood = await owner.client.farm.current();
    expect(asItStood).toMatchObject({ ventureInvestorsPercent: 60 });

    await owner.client.farm.setParameters({ ventureInvestorsPercent: 55 });
    const moved = await as("owner", "2044-08-24T05:00:00.000Z");
    expect(await moved.client.farm.current()).toMatchObject({
      ventureInvestorsPercent: 55,
    });

    // A Venture's own Parameters are the Owner's, as a Venture is.
    const manager = await as("manager", "2044-08-24T06:00:00.000Z");
    await expect(
      manager.client.farm.setParameters({ ventureInvestorsPercent: 90 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // And it is a starting point, never a rule: an Agreement may still be signed on another figure, and
    // what the paper says is what the Settlement divides on.
    await owner.client.farm.setParameters({ ventureInvestorsPercent: 60 });
  });
});

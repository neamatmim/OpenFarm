import type { SopContent } from "@OpenFarm/domain";
import { findStructuralProblems, standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { dueSlotsFor } from "../instances-store";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The store is counted every Friday morning, once for the whole farm, raised by the clock. A count nobody makes goes
// late to the Manager and then to the Owner, and the Owner's home says when the store was last counted once it has
// not been for more than a week.

const suffix = `store-${Date.now()}`;
/** A Thursday and the Friday after it, on the farm's clock (UTC+6): 09:00 there is 03:00 here. */
const THURSDAY = "2056-03-02";
const FRIDAY = "2056-03-03";

let countId = "";

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2056-02-20T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  // Two Pens standing full: the count is still one.
  await Promise.all(
    [`ক ${suffix}`, `খ ${suffix}`].map(async (name) => {
      const pen = await owner.client.sheds.pens.create({
        shedId: shed.id,
        name,
      });
      await owner.client.animals.register({
        sex: "female",
        side: "dairy",
        state: "heifer",
        penId: pen.id,
        source: "born",
        aliases: [],
      });
    })
  );
  // A farm that keeps feed and has had some in, so there is a store to count.
  const concentrate = await owner.client.feed.items.create({
    name: { bn: `দানাদার ${suffix}` },
  });
  await owner.client.stock.receive({
    feedItemId: concentrate.id,
    kind: "purchase",
    quantity: 100,
    priceMoney: 4000,
    seller: { name: `দোকান ${suffix}` },
    receivedOn: "2056-02-20",
  });
  const sop = await owner.client.sops.create({
    content: standardPlaybook().stockCount,
  });
  countId = sop.definitionId;
});

/** The count's work on a morning, as the Manager's day raises it. */
const countsOn = async (day: string) => {
  const manager = await as("manager", `${day}T03:30:00.000Z`);
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today();
  return today.filter((row) => row.definitionId === countId);
};

describe("the Friday count", () => {
  it("is not raised on a Thursday", async () => {
    expect(await countsOn(THURSDAY)).toHaveLength(0);
  });

  it("is raised once on a Friday, for the whole farm, however many Pens stand full", async () => {
    const work = await countsOn(FRIDAY);
    expect(work).toHaveLength(1);
    expect(work[0]).toMatchObject({
      penId: null,
      assignedRole: "manager",
      checkerRole: "owner",
    });
    // Asked again the same morning, still one.
    expect(await countsOn(FRIDAY)).toHaveLength(1);
  });

  it("goes late to the Manager, then to the Owner", async () => {
    const [work] = await countsOn(FRIDAY);
    const told = async (
      kind: "instance_overdue" | "instance_escalated",
      role: "owner" | "manager"
    ) => {
      const rows = await scratchDb().query.alert.findMany({
        where: { kind, userId: thePerson(role).id, entityId: work?.id ?? "" },
        columns: { id: true },
      });
      return rows.length;
    };
    // A day's grace from nine on Friday, so late on Saturday morning.
    const saturday = await as("manager", "2056-03-04T03:20:00.000Z");
    await saturday.client.alerts.sweep();
    expect(await told("instance_overdue", "manager")).toBe(1);
    expect(await told("instance_escalated", "owner")).toBe(0);
    // The farm's escalation window on, the Owner hears.
    const later = await as("manager", "2056-03-04T05:10:00.000Z");
    await later.client.alerts.sweep();
    expect(await told("instance_escalated", "owner")).toBe(1);
  });
});

describe("the Owner's home", () => {
  it("says the store has never been counted, then nothing once it has, then when it last was", async () => {
    const [work] = await countsOn(FRIDAY);
    const ownerOn = async (instant: string) => {
      const owner = await as("owner", instant);
      const home = await owner.client.overview.get();
      return home.needsYou.storeCount;
    };

    expect(await ownerOn("2056-03-04T08:00:00.000Z")).toEqual({
      lastCountedAt: null,
    });

    const manager = await as("manager", "2056-03-04T08:00:00.000Z");
    await manager.client.work.claim({ id: work?.id ?? "" });
    const board = await manager.client.work.get({ id: work?.id ?? "" });
    await manager.client.work.completeStep({
      instanceId: work?.id ?? "",
      stepId: "count",
      evidence: [true],
      // Counted blind, and the sacks found short of what came in, so the count says why.
      counts: (board.stockCount?.items ?? []).map((item) => ({
        feedItemId: item.feedItemId,
        counted: 0,
        reason: `গুদাম খালি পাওয়া গেছে ${suffix}`,
      })),
    });
    expect(await ownerOn("2056-03-05T08:00:00.000Z")).toBeNull();

    // Nine days on, a count missed: when it last was.
    expect(await ownerOn("2056-03-13T08:00:00.000Z")).toEqual({
      lastCountedAt: new Date("2056-03-04T08:00:00.000Z"),
    });
  });
});

describe("work about the whole farm", () => {
  it("may count the store, and still may not carry an effect that needs a Pen", () => {
    const standard = standardPlaybook().stockCount;
    expect(findStructuralProblems(standard)).toEqual([]);
    const moving: SopContent = {
      ...standard,
      steps: [
        {
          id: "move",
          text: { bn: "সরান" },
          repeatPerAnimal: false,
          evidence: [],
          skipReasons: [],
          effect: { kind: "move" },
        },
      ],
    };
    expect(findStructuralProblems(moving).join(" ")).toContain("whole farm");
  });

  it("is raised for no farm with nothing on it", () => {
    const standard = standardPlaybook().stockCount;
    const slots = dueSlotsFor(
      new Date(`${FRIDAY}T03:30:00.000Z`),
      [{ definitionId: "count", versionId: "v", content: standard }],
      []
    );
    expect(slots).toEqual([]);
  });
});

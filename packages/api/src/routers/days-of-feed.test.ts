import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Days of feed left: each Feed Item's store over what it has been fed a day lately, and a feed with fewer days than the
// farm's line Running Low — told to the Manager in the evening's post, once until the store is brought back up.

const suffix = `days-of-feed-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const feedSop = (): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix}`, en: "Feeding" },
  purpose: { bn: "পেনে খাবার দেওয়া" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "feed",
      text: { bn: "খাওয়ান" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "feeding" },
    },
  ],
});

let bran = "";
let hay = "";
let penId = "";
let sopId = "";

/** Six in the morning at the farm on a day of April 2069. */
const morning = (day: number) =>
  `2069-04-${String(day).padStart(2, "0")}T00:00:00.000Z`;
/** Six in the evening at the farm, when the post goes out. */
const evening = (day: number) =>
  `2069-04-${String(day).padStart(2, "0")}T12:00:00.000Z`;

const buy = async (feedItemId: string, day: number, quantity: number) => {
  const manager = await as("manager", morning(day));
  await manager.client.stock.receive({
    feedItemId,
    kind: "purchase",
    quantity,
    priceMoney: quantity * 30,
    seller: { name: `রহমান ফিডস ${suffix}` },
    receivedOn: `2069-04-${String(day).padStart(2, "0")}`,
  });
};

/** The Pen fed so much bran on a morning. */
const feedOn = async (day: number, givenKg: number) => {
  const manager = await as("manager", morning(day));
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today({ penId });
  const work = today.find((one) => one.definitionId === sopId);
  await manager.client.work.claim({ id: work?.id ?? "" });
  await manager.client.work.completeStep({
    instanceId: work?.id ?? "",
    stepId: "feed",
    evidence: [true],
    feeding: [{ feedItemId: bran, givenKg }],
  });
};

const lineOf = async (feedItemId: string, instant: string) => {
  const manager = await as("manager", instant);
  const lines = await manager.client.stock.onHand();
  return lines.find((line) => line.feedItemId === feedItemId);
};

const toldOfBran = async (role: "owner" | "manager") => {
  const rows = await scratchDb().query.alert.findMany({
    where: { kind: "low_stock", userId: thePerson(role).id },
    columns: { params: true },
  });
  return rows.filter(
    (row) => (row.params as { feedItemId?: string }).feedItemId === bran
  );
};

beforeAll(async () => {
  const owner = await as("owner", morning(1));
  const manager = await as("manager", morning(1));
  const branItem = await manager.client.feed.addItem({
    name: { bn: `ভুসি ${suffix}` },
  });
  const hayItem = await manager.client.feed.addItem({
    name: { bn: `খড় ${suffix}` },
  });
  bran = branItem.id;
  hay = hayItem.id;
  const shed = await manager.client.sheds.createShed({ name: suffix });
  const pen = await manager.client.sheds.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ভুসির পেন ${suffix}`,
  });
  penId = pen.id;
  for (const _ of [1, 2]) {
    // oxlint-disable-next-line no-await-in-loop -- two bulls, one after the other
    await manager.client.animals.register({
      sex: "male",
      side: "fattening",
      state: "quarantine",
      penId,
      source: "bought",
      aliases: [],
    });
  }
  const ration = await manager.client.feed.saveRation({
    name: { bn: `ভুসির রেশন ${suffix}` },
    items: [{ feedItemId: bran, kgPerAnimalPerDay: 50 }],
  });
  await manager.client.feed.assignRation({
    penId,
    rationId: ration.rationId,
  });
  const sop = await owner.client.sops.create({ content: feedSop() });
  sopId = sop.definitionId;

  // A thousand kilos in on the 1st; a hundred a day fed from the 2nd to the 6th.
  await buy(bran, 1, 1000);
  await buy(hay, 1, 300);
  for (const day of [2, 3, 4, 5, 6]) {
    // oxlint-disable-next-line no-await-in-loop -- morning after morning
    await feedOn(day, 100);
  }
});

describe("days of feed left", () => {
  it("is the store over what it has been fed a day lately", async () => {
    // Five hundred left at a hundred a day, the 2nd to the 6th counted as five days.
    expect(await lineOf(bran, evening(6))).toMatchObject({
      onHand: 500,
      fedPerDay: 100,
      daysLeft: 5,
      runningLow: true,
    });
  });

  it("says nothing of a feed nobody feeds", async () => {
    expect(await lineOf(hay, evening(6))).toMatchObject({
      fedPerDay: null,
      daysLeft: null,
      runningLow: false,
    });
  });

  it("tells the Manager once, in the evening's post, and not the Owner", async () => {
    const sweeping = await as("manager", evening(6));
    await sweeping.client.alerts.sweep();
    await sweeping.client.alerts.sweep();
    expect(await toldOfBran("manager")).toHaveLength(1);
    expect(await toldOfBran("owner")).toEqual([]);
  });

  it("is the Manager's line to move", async () => {
    const manager = await as("manager", evening(6));
    await manager.client.farm.setParameters({ feedDaysLow: 3 });
    try {
      expect(await lineOf(bran, evening(6))).toMatchObject({
        runningLow: false,
      });
    } finally {
      await manager.client.farm.setParameters({ feedDaysLow: 7 });
    }
  });

  it("comes off the list when a lorry brings the store back up", async () => {
    await buy(bran, 7, 1000);
    expect(await lineOf(bran, evening(7))).toMatchObject({
      onHand: 1500,
      runningLow: false,
    });
  });
});

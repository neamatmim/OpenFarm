import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The feed store against its counts: a lorry after the count is not wiped out by it, each delivery keeps what is left
// of it, and a count that matched when it was made still says so when a late entry makes it short.

const suffix = `feed-stock-${Date.now()}`;

const countSop = (): SopContent => ({
  name: { bn: `গুদাম গণনা ${suffix}`, en: "Stock count" },
  purpose: { bn: "গুদামে আসলে কী আছে তা গোনা" },
  triggers: [],
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "count",
      text: { bn: "প্রতিটি খাদ্য গুনুন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "stock_count" },
    },
  ],
});

let penId = "";
let definitionId = "";

const managerAt = (at: string) =>
  createTestClient(appRouter, { as: "manager", clock: new FakeClock(at) });

beforeAll(async () => {
  const manager = await managerAt("2036-01-01T04:00:00.000Z");
  const shed = await manager.client.sheds.create({ name: suffix });
  const pen = await manager.client.sheds.pens.create({
    shedId: shed.id,
    name: `গুদাম ${suffix}`,
  });
  penId = pen.id;
  const owner = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock("2036-01-01T04:00:00.000Z"),
  });
  ({ definitionId } = await owner.client.sops.create({ content: countSop() }));
});

const aFeed = async (name: string) => {
  const manager = await managerAt("2036-01-01T04:00:00.000Z");
  const made = await manager.client.feed.items.create({
    name: { bn: `${name} ${suffix}` },
  });
  return made.id;
};

const receive = async (
  feedItemId: string,
  receivedOn: string,
  quantity: number,
  {
    at = `${receivedOn}T03:00:00.000Z`,
    expiresOn,
  }: { at?: string; expiresOn?: string } = {}
) => {
  const manager = await managerAt(at);
  return await manager.client.stock.receive({
    feedItemId,
    kind: "purchase",
    quantity,
    priceMoney: quantity * 40,
    seller: { name: `রহমান ফিডস ${suffix}` },
    receivedOn,
    ...(expiresOn ? { expiresOn, lotNumber: `LOT-${expiresOn}` } : {}),
  });
};

const lineFor = async (at: string, feedItemId: string) => {
  const manager = await managerAt(at);
  const stock = await manager.client.stock.onHand();
  return stock.find((line) => line.feedItemId === feedItemId);
};

/** A count on `at`: every feed as the store has it, but these. */
const countAt = async (at: string, found: Record<string, number>) => {
  const manager = await managerAt(at);
  await manager.client.work.raiseNow({ definitionId, penId });
  const today = await manager.client.work.today({ penId });
  const work = today.find(
    (row) => row.definitionId === definitionId && row.state === "due"
  );
  await manager.client.work.claim({ id: work?.id ?? "" });
  const board = await manager.client.work.get({ id: work?.id ?? "" });
  const stock = await manager.client.stock.onHand();
  await manager.client.work.completeStep({
    instanceId: work?.id ?? "",
    stepId: "count",
    evidence: [true],
    counts: (board.stockCount?.items ?? []).map((item) => {
      const onHand = Math.max(
        0,
        stock.find((line) => line.feedItemId === item.feedItemId)?.onHand ?? 0
      );
      const counted = found[item.feedItemId] ?? onHand;
      return {
        feedItemId: item.feedItemId,
        counted,
        ...(counted === onHand ? {} : { reason: "গণনায় যা পাওয়া গেছে" }),
      };
    }),
  });
  await manager.client.work.complete({ id: work?.id ?? "" });
};

describe("the feed store against its counts", () => {
  it("keeps a lorry that came in after the morning's count, on the count's own day", async () => {
    const feed = await aFeed("বিকেলের লরি");
    await receive(feed, "2036-01-02", 100);
    // Ten in the morning at the farm: the count finds the hundred.
    await countAt("2036-01-05T04:00:00.000Z", {});
    // Four in the afternoon, the same day: a thousand more.
    await receive(feed, "2036-01-05", 1000, { at: "2036-01-05T10:00:00.000Z" });
    const line = await lineFor("2036-01-05T11:00:00.000Z", feed);
    expect(line?.onHand).toBe(1100);
  });

  it("warns of a delivery's day, though one before it was counted out", async () => {
    const feed = await aFeed("দুই চালান");
    await receive(feed, "2036-01-06", 100);
    await countAt("2036-01-08T04:00:00.000Z", { [feed]: 0 });
    await receive(feed, "2036-01-09", 100, { expiresOn: "2036-01-20" });
    const line = await lineFor("2036-01-10T04:00:00.000Z", feed);
    expect(line?.nextExpiresOn).toBe("2036-01-20");
  });

  it("still shows a count that matched, once a late entry makes it short", async () => {
    const feed = await aFeed("দেরিতে লেখা");
    await receive(feed, "2036-01-10", 100);
    await countAt("2036-01-15T04:00:00.000Z", {});
    // Fifty more came on the twelfth, written down only after the count found a hundred.
    await receive(feed, "2036-01-12", 50, { at: "2036-01-16T04:00:00.000Z" });
    const manager = await managerAt("2036-01-17T04:00:00.000Z");
    const adjustments = await manager.client.stock.adjustments({
      feedItemId: feed,
    });
    expect(adjustments.map((one) => one.difference)).toEqual([-50]);
  });
});

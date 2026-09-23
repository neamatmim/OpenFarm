import { uuidv7 } from "@OpenFarm/db/ids";
import { feeding } from "@OpenFarm/db/schema/feed";
import type { FeedingLine } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// What each Pen left in the trough over the last days, item by item, what it cost, and where it stands: a Pen given
// more straw than it eats is wasting straw, whatever it does with its concentrate.

const suffix = `${Date.now()}`;
/** Midday, the day the report is read. */
const NOW = "2035-03-10T06:00:00.000Z";
const HOUR_MS = 60 * 60 * 1000;
/** A week of feeding twice a day. */
const WEEK_OF_SESSIONS = 14;
/** What the farm paid for a kilo of straw. */
const STRAW_TAKA_PER_KG = 10;

const as = (role: "owner" | "manager" | "staff", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const setup = async () => {
  const manager = await as("manager", "2035-02-01T04:00:00.000Z");
  const shed = await manager.client.herd.createShed({
    name: `উচ্ছিষ্ট ${suffix}`,
  });
  const pen = async (name: string) =>
    await manager.client.herd.createPen({ shedId: shed.id, name });
  const [wasting, fine, seldom, cleared] = await Promise.all([
    pen("ক পেন"),
    pen("খ পেন"),
    pen("গ পেন"),
    pen("ঘ পেন"),
  ]);
  const item = async (bn: string) =>
    await manager.client.feed.addItem({ name: { bn: `${bn} ${suffix}` } });
  const straw = await item("খড়");
  const concentrate = await item("দানাদার");
  // Never bought and never priced: what is left of it is worth a figure nobody knows.
  const grass = await item("ঘাস");
  await manager.client.stock.receive({
    feedItemId: straw.id,
    kind: "purchase",
    quantity: 1000,
    priceBdt: 1000 * STRAW_TAKA_PER_KG,
    seller: { name: `খড়ের ব্যাপারী ${suffix}` },
    receivedOn: "2035-02-01",
  });
  const ration = await manager.client.feed.saveRation({
    name: { bn: `মোটাতাজাকরণ ${suffix}` },
    items: [
      { feedItemId: straw.id, kgPerAnimalPerDay: 4 },
      { feedItemId: concentrate.id, kgPerAnimalPerDay: 2 },
      { feedItemId: grass.id, kgPerAnimalPerDay: 10 },
    ],
  });
  const saved = await scratchDb().query.ration.findFirst({
    where: { id: ration.rationId },
    columns: { currentVersionId: true },
  });
  return {
    pens: { wasting, fine, seldom, cleared },
    items: { straw, concentrate, grass },
    rationVersionId: saved?.currentVersionId ?? "",
    rationName: `মোটাতাজাকরণ ${suffix}`,
  };
};

let world: Awaited<ReturnType<typeof setup>>;

/** One session in a Pen, some hours before the report is read. Written straight in: the report reads Feedings, and
 *  how a Step writes one is the feeding tests' business. */
const fed = async (
  penId: string,
  hoursAgo: number,
  lines: Omit<FeedingLine, "targetKg">[]
) => {
  const at = new Date(new Date(NOW).getTime() - hoursAgo * HOUR_MS);
  const id = uuidv7(at);
  await scratchDb()
    .insert(feeding)
    .values({
      id,
      farmId: theFarm().id,
      instanceId: `instance-${id}`,
      completionId: `completion-${id}`,
      penId,
      rationVersionId: world.rationVersionId,
      animals: 5,
      sessionsPerDay: 2,
      lines: lines.map((line) => ({ ...line, targetKg: line.givenKg })),
      fedAt: at,
      recordedAt: at,
    });
};

/** Every twelve hours for a week, the latest six hours ago. */
const aWeekOf = async (
  penId: string,
  line: (session: number) => Omit<FeedingLine, "targetKg">[]
) => {
  for (let session = 0; session < WEEK_OF_SESSIONS; session += 1) {
    // One at a time: uuidv7 orders them by the moment they were fed.
    // oxlint-disable-next-line no-await-in-loop
    await fed(penId, 6 + session * 12, line(session));
  }
};

beforeAll(async () => {
  world = await setup();
  const { straw, concentrate, grass } = world.items;
  // Pen ক leaves two kilos of every ten of straw — a fifth of it — and clears its concentrate every time.
  await aWeekOf(world.pens.wasting.id, () => [
    { feedItemId: straw.id, givenKg: 10, leftoverKg: 2 },
    { feedItemId: concentrate.id, givenKg: 5, leftoverKg: 0 },
  ]);
  // Long before the week: a bad day, which a week's report does not count.
  await fed(world.pens.wasting.id, 24 * 10, [
    { feedItemId: straw.id, givenKg: 10, leftoverKg: 10 },
  ]);
  // Pen খ leaves a little straw now and then, and some grass nobody ever priced.
  await aWeekOf(world.pens.fine.id, (session) => [
    {
      feedItemId: straw.id,
      givenKg: 10,
      leftoverKg: session % 4 === 0 ? 0.5 : 0,
    },
    { feedItemId: grass.id, givenKg: 20, leftoverKg: 1 },
  ]);
  // Pen ঘ never leaves a scrap of anything.
  await aWeekOf(world.pens.cleared.id, () => [
    { feedItemId: straw.id, givenKg: 10, leftoverKg: 0 },
    { feedItemId: concentrate.id, givenKg: 5, leftoverKg: 0 },
  ]);
  // Pen গ was fed twice this week: too seldom to judge, however much it left.
  await fed(world.pens.seldom.id, 6, [
    { feedItemId: straw.id, givenKg: 10, leftoverKg: 5 },
  ]);
  await fed(world.pens.seldom.id, 18, [
    { feedItemId: straw.id, givenKg: 10, leftoverKg: 5 },
  ]);
});

describe("the Leftovers", () => {
  it("says which Pen is given more of a Feed Item than it eats, and what that cost", async () => {
    const owner = await as("owner");
    const rows = await owner.client.feed.leftovers({ days: 7 });
    const straw = rows.find(
      (one) =>
        one.penId === world.pens.wasting.id &&
        one.feedItemId === world.items.straw.id
    );
    expect(straw).toEqual({
      penId: world.pens.wasting.id,
      penName: `উচ্ছিষ্ট ${suffix} / ক পেন`,
      rationName: world.rationName,
      feedItemId: world.items.straw.id,
      itemName: `খড় ${suffix}`,
      unit: "kg",
      givenKg: 140,
      leftoverKg: 28,
      leftoverPercent: 20,
      sessions: WEEK_OF_SESSIONS,
      sessionsWithLeftover: WEEK_OF_SESSIONS,
      // 28 kg of straw at the ten taka a kilo the farm paid for it.
      worthBdt: 28 * STRAW_TAKA_PER_KG,
      standing: "wasting",
    });
    // Wasted feed is what the Manager reads first.
    expect(rows[0]?.standing).toBe("wasting");
  });

  it("says of a trough never left with a scrap that the Pen may want more, and not of one item cleared", async () => {
    const owner = await as("owner");
    const rows = await owner.client.feed.leftovers({ days: 7 });
    const concentrateIn = (penId: string) =>
      rows.find(
        (one) =>
          one.penId === penId && one.feedItemId === world.items.concentrate.id
      );
    // Pen ক clears its concentrate but leaves straw: fed enough of it.
    expect(concentrateIn(world.pens.wasting.id)).toMatchObject({
      leftoverKg: 0,
      worthBdt: 0,
      standing: "fine",
    });
    // Pen ঘ clears everything, every time.
    expect(
      rows
        .filter((one) => one.penId === world.pens.cleared.id)
        .map((one) => one.standing)
    ).toEqual(["all_eaten", "all_eaten"]);
  });

  it("finds a little left now and then fine, and cannot price feed nobody priced", async () => {
    const owner = await as("owner");
    const rows = await owner.client.feed.leftovers({ days: 7 });
    const inFine = rows.filter((one) => one.penId === world.pens.fine.id);
    expect(
      inFine.find((one) => one.feedItemId === world.items.straw.id)
    ).toMatchObject({
      leftoverKg: 2,
      leftoverPercent: 1,
      sessionsWithLeftover: 4,
      worthBdt: 2 * STRAW_TAKA_PER_KG,
      standing: "fine",
    });
    expect(
      inFine.find((one) => one.feedItemId === world.items.grass.id)
    ).toMatchObject({ leftoverKg: 14, worthBdt: null, standing: "fine" });
  });

  it("does not judge a Pen fed too seldom to say", async () => {
    const owner = await as("owner");
    const rows = await owner.client.feed.leftovers({ days: 7 });
    expect(
      rows.find((one) => one.penId === world.pens.seldom.id)
    ).toMatchObject({ leftoverPercent: 50, sessions: 2, standing: "too_few" });
  });

  it("reads further back when asked", async () => {
    const owner = await as("owner");
    const week = await owner.client.feed.leftovers({ days: 7 });
    const fortnight = await owner.client.feed.leftovers({ days: 14 });
    const strawIn = (rows: typeof week) =>
      rows.find(
        (one) =>
          one.penId === world.pens.wasting.id &&
          one.feedItemId === world.items.straw.id
      );
    expect(strawIn(week)?.sessions).toBe(WEEK_OF_SESSIONS);
    // The bad day ten days ago is in a fortnight's.
    expect(strawIn(fortnight)).toMatchObject({
      sessions: WEEK_OF_SESSIONS + 1,
      leftoverKg: 38,
    });
  });

  it("is the Owner's and the Manager's, as the farm's money is", async () => {
    const manager = await as("manager");
    expect(await manager.client.feed.leftovers({ days: 7 })).not.toEqual([]);
    const staff = await as("staff");
    await expect(
      staff.client.feed.leftovers({ days: 7 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

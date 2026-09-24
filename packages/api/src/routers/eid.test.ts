import { eq } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Eid-ul-Adha as the farm feeds towards it: the table's expected day, until the Owner or the Manager writes in the day
// the moon sighting committee announced — and then the farm's own animals still aimed at the old day are offered the
// move, which leaves a Venture's animals, a window typed for another market, and animals already gone.

const suffix = `eid-${Date.now()}`;
const JANUARY = "2027-01-10T04:00:00.000Z";

const as = (role: "owner" | "manager" | "staff", instant = JANUARY) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const setup = async () => {
  const manager = await as("manager");
  const shed = await manager.client.herd.createShed({ name: suffix });
  const pen = await manager.client.herd.createPen({
    shedId: shed.id,
    name: "ঈদের পেন",
  });
  const bull = async (window?: { start: string; end: string }) =>
    await manager.client.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 60_000,
      weightKg: 220,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(JANUARY),
      ...(window
        ? { targetWindowStart: window.start, targetWindowEnd: window.end }
        : {}),
    });
  const ours = [await bull(), await bull()];
  // Sold early at the haats before Eid: a market of the Manager's own choosing.
  const typed = await bull({ start: "2027-05-01", end: "2027-05-05" });
  const theVentures = await bull();
  const gone = await bull();
  const owner = await as("owner");
  const venture = await owner.client.ventures.open({
    name: `ঈদ ২০২৭ ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2027-01-20",
    targetWindowStart: "2027-05-17",
    targetWindowEnd: "2027-05-19",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  await scratchDb()
    .update(animal)
    .set({ ownerVentureId: venture.id })
    .where(eq(animal.id, theVentures.id));
  await scratchDb()
    .update(animal)
    .set({ state: "sold" })
    .where(eq(animal.id, gone.id));
  return { pen, bull, ours, typed, theVentures, gone };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

const windowOf = async (animalId: string) => {
  const row = await scratchDb().query.intake.findFirst({
    where: { animalId },
    columns: { targetWindowStart: true, targetWindowEnd: true },
  });
  return { start: row?.targetWindowStart, end: row?.targetWindowEnd };
};

const nextEid = async (instant = JANUARY) => {
  const manager = await as("manager", instant);
  return await manager.client.eid.next();
};

describe("the Eid the farm feeds towards", () => {
  it("is the day the table expects, until somebody writes the announced one in", async () => {
    expect(await nextEid()).toEqual({
      window: { start: "2027-05-17", end: "2027-05-19", basis: "expected" },
      expectedDay: null,
      behind: 0,
      inVentures: 0,
    });
    expect(await windowOf(world.ours[0]?.id ?? "")).toEqual({
      start: "2027-05-17",
      end: "2027-05-19",
    });
  });

  it("refuses a day that is no Eid, a year typed wrong", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.eid.announce({ day: "2026-05-18" })
    ).rejects.toMatchObject({ data: { refusal: "not_an_eid" } });
  });

  it("is written in by the Owner or the Manager, not the Staff", async () => {
    const staff = await as("staff");
    await expect(
      staff.client.eid.announce({ day: "2027-05-18" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("once announced, is the day every bull taken in afterwards is fed towards", async () => {
    const manager = await as("manager");
    await manager.client.eid.announce({ day: "2027-05-18" });
    const after = await world.bull();
    expect(await windowOf(after.id)).toEqual({
      start: "2027-05-18",
      end: "2027-05-20",
    });
  });

  it("counts the farm's own bulls still aimed at the day expected, and a Venture's apart", async () => {
    expect(await nextEid()).toEqual({
      window: { start: "2027-05-18", end: "2027-05-20", basis: "announced" },
      expectedDay: "2027-05-17",
      behind: 2,
      inVentures: 1,
    });
  });

  it("brings the farm's own along, and leaves the Venture's, the typed and the sold", async () => {
    const manager = await as("manager");
    const done = await manager.client.eid.bringAlong({
      expectedDay: "2027-05-17",
    });
    expect(done.moved).toBe(2);
    const announced = { start: "2027-05-18", end: "2027-05-20" };
    for (const one of world.ours) {
      // oxlint-disable-next-line no-await-in-loop -- two bulls, read one after the other
      expect(await windowOf(one.id)).toEqual(announced);
    }
    expect(await windowOf(world.typed.id)).toEqual({
      start: "2027-05-01",
      end: "2027-05-05",
    });
    const expected = { start: "2027-05-17", end: "2027-05-19" };
    expect(await windowOf(world.theVentures.id)).toEqual(expected);
    expect(await windowOf(world.gone.id)).toEqual(expected);
    expect(await nextEid()).toMatchObject({ behind: 0, inVentures: 1 });
    const trail = await scratchDb().query.auditEvent.findMany({
      where: { entity: "animal", entityId: world.ours[0]?.id ?? "" },
      columns: { before: true, after: true },
      orderBy: { receivedAt: "desc", id: "desc" },
    });
    expect(trail[0]).toEqual({
      before: { targetWindow: expected },
      after: { targetWindow: announced },
    });
  });

  it("brings along the bulls moved to a day announced wrong, when it is put right", async () => {
    const manager = await as("manager");
    await manager.client.eid.announce({ day: "2027-05-16" });
    // The two moved and the one taken in on the 18th, all aimed at the day announced first.
    expect(await nextEid()).toMatchObject({
      window: { start: "2027-05-16", basis: "announced" },
      behind: 3,
    });
    const done = await manager.client.eid.bringAlong({
      expectedDay: "2027-05-17",
    });
    expect(done.moved).toBe(3);
  });

  it("refuses to bring anybody along to an Eid nobody announced", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.eid.bringAlong({ expectedDay: "2028-05-06" })
    ).rejects.toMatchObject({ data: { refusal: "eid_not_announced" } });
  });
});

describe("an Eid past the end of the farm's list", () => {
  const PAST_THE_TABLE = "2036-06-01T04:00:00.000Z";

  it("is the calendar's guess, and a bull taken in is fed towards it", async () => {
    const next = await nextEid(PAST_THE_TABLE);
    expect(next.window).toEqual({
      start: "2037-01-28",
      end: "2037-01-30",
      basis: "estimated",
    });
    const manager = await as("manager", PAST_THE_TABLE);
    const taken = await manager.client.intake.record({
      penId: world.pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 60_000,
      weightKg: 220,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(PAST_THE_TABLE),
    });
    expect(taken.targetWindow).toMatchObject({
      start: "2037-01-28",
      end: "2037-01-30",
    });
  });
});

// Each a little later than the last, as they happen: the order an Eid's rows were written in is which day is in force,
// and a test clock sent back to January would write a row that sorts before the ones it follows.
const FEBRUARY = (day: number) =>
  `2027-02-${String(day).padStart(2, "0")}T04:00:00.000Z`;

describe("the farm's list of Eids", () => {
  it("names each Eid by the farm's day and how it knows it, and counts who is aimed at it", async () => {
    const { client: manager } = await as("manager", FEBRUARY(1));

    const listed = await manager.eid.list();

    const lastYear = listed.find((one) => one.expectedDay === "2026-05-28");
    const thisYear = listed.find((one) => one.expectedDay === "2027-05-17");
    expect(lastYear?.past).toBe(true);
    expect(thisYear).toMatchObject({
      window: { start: "2027-05-16", end: "2027-05-18", basis: "announced" },
      next: true,
      announced: true,
    });
    // The farm's own two were brought along to the day now in force; the Venture's still waits on the day expected.
    expect(thisYear?.aimed.own).toBeGreaterThanOrEqual(2);
    expect(thisYear?.behind.inVentures).toBe(1);
    // The bull taken in past the table is aimed at the calendar's 2037 guess, which nobody announced: he is fed towards
    // the day it is on, and not behind it.
    expect(
      listed.find((one) => one.expectedDay === "2037-01-28")
    ).toMatchObject({
      window: { basis: "estimated" },
      aimed: { own: 1, inVentures: 0 },
      behind: { own: 0, inVentures: 0 },
    });
  });

  it("takes an announced day back, and offers the bulls brought to it the move back to the day expected", async () => {
    const { client: manager } = await as("manager", FEBRUARY(2));

    await manager.eid.withdraw({ expectedDay: "2027-05-17" });
    const next = await manager.eid.next();

    expect(next.window).toEqual({
      start: "2027-05-17",
      end: "2027-05-19",
      basis: "expected",
    });
    expect(next.behind).toBeGreaterThanOrEqual(2);
    const done = await manager.eid.bringAlong({ expectedDay: "2027-05-17" });
    expect(done.moved).toBe(next.behind);
    for (const one of world.ours) {
      // oxlint-disable-next-line no-await-in-loop -- two bulls, read one after the other
      expect(await windowOf(one.id)).toEqual({
        start: "2027-05-17",
        end: "2027-05-19",
      });
    }
  });

  it("announces the day expected itself, once an announcement has been taken back", async () => {
    const { client: manager } = await as("manager", FEBRUARY(3));

    await manager.eid.announce({ day: "2027-05-17" });
    const next = await manager.eid.next();

    expect(next.window).toMatchObject({
      start: "2027-05-17",
      basis: "announced",
    });
  });

  it("refuses to take back an Eid nobody announced, and is not the Staff's to take back", async () => {
    const { client: manager } = await as("manager", FEBRUARY(4));
    const { client: staff } = await as("staff", FEBRUARY(4));

    await expect(
      manager.eid.withdraw({ expectedDay: "2028-05-06" })
    ).rejects.toMatchObject({ data: { refusal: "eid_not_announced" } });
    await expect(
      staff.eid.withdraw({ expectedDay: "2027-05-17" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

// An animal is on the farm from the moment she came to the moment she left, and nothing about her is dated outside
// that: not her arrival, written up a day late; not a sale or a death before she came; not a birth still to come.

const suffix = `herd-dates-${Date.now()}`;
let penId = "";
let otherPenId = "";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2069-01-01T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `পেন ${suffix}`,
    quarantine: true,
  });
  const other = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `অন্য পেন ${suffix}`,
    quarantine: true,
  });
  penId = pen.id;
  otherPenId = other.id;
});

const aBull = async (
  recordedAt: string,
  arrivedAt: string,
  buyingTripId?: string
) => {
  const manager = await as("manager", recordedAt);
  return await manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceMoney: 50_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(arrivedAt),
    ...(buyingTripId ? { buyingTripId } : {}),
  });
};

const arrivalOf = async (tagNumber: string) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber },
    columns: { id: true, stateChangedAt: true },
    with: {
      moves: {
        columns: { movedAt: true },
        orderBy: { movedAt: "asc" },
        limit: 1,
      },
    },
  });
  return {
    movedAt: her?.moves[0]?.movedAt,
    stateChangedAt: her?.stateChangedAt,
  };
};

describe("an Intake written up a day late", () => {
  it("puts him on the books from when he came, not when he was typed", async () => {
    const bull = await aBull(
      "2069-01-16T04:00:00.000Z",
      "2069-01-15T04:00:00.000Z"
    );
    const arrived = new Date("2069-01-15T04:00:00.000Z");
    expect(await arrivalOf(bull.tagNumber)).toEqual({
      movedAt: arrived,
      stateChangedAt: arrived,
    });
  });

  it("is refused before the outing that brought him went", async () => {
    const manager = await as("manager", "2069-01-20T04:00:00.000Z");
    const trip = await manager.client.buyingTrips.record({
      wentTo: `গাবতলী ${suffix}`,
      brokerMoney: 1000,
      transportMoney: 1000,
      keepMoney: 0,
      paymentMethod: "cash",
    });
    await expect(
      aBull("2069-01-20T05:00:00.000Z", "2069-01-10T04:00:00.000Z", trip.id)
    ).rejects.toMatchObject({ data: { refusal: "arrived_before_the_trip" } });
  });
});

describe("leaving before coming", () => {
  it("refuses a Sale dated before he came", async () => {
    const bull = await aBull(
      "2069-02-10T04:00:00.000Z",
      "2069-02-10T04:00:00.000Z"
    );
    const manager = await as("manager", "2069-02-20T04:00:00.000Z");
    await expect(
      manager.client.sales.record({
        tagNumber: bull.tagNumber,
        buyer: { name: `করিম ব্যাপারী ${suffix}` },
        weightKg: 300,
        destination: `গাবতলী ${suffix}`,
        vehicle: "ঢাকা মেট্রো-ট ১১-৪৪৫৬",
        driver: `চালক ${suffix}`,
        priceMoney: 90_000,
        soldAt: new Date("2069-02-01T04:00:00.000Z"),
      })
    ).rejects.toMatchObject({ data: { refusal: "before_she_was_here" } });
  });

  it("refuses a death dated before he came", async () => {
    const bull = await aBull(
      "2069-03-10T04:00:00.000Z",
      "2069-03-10T04:00:00.000Z"
    );
    const manager = await as("manager", "2069-03-20T04:00:00.000Z");
    await expect(
      manager.client.animals.recordMortality({
        photo: A_DEATH_PHOTO,
        tagNumber: bull.tagNumber,
        kind: "died",
        cause: `জ্বর ${suffix}`,
        disposal: "buried",
        happenedAt: new Date("2069-03-01T04:00:00.000Z"),
      })
    ).rejects.toMatchObject({ data: { refusal: "before_she_was_here" } });
  });
});

describe("a calf registered by hand", () => {
  it("is refused a birth still to come", async () => {
    const owner = await as("owner", "2069-04-01T04:00:00.000Z");
    await expect(
      owner.client.animals.register({
        sex: "female",
        side: "dairy",
        state: "calf",
        penId,
        source: "born",
        aliases: [],
        birthDate: "2069-06-01",
      })
    ).rejects.toMatchObject({ data: { refusal: "born_in_the_future" } });
  });
});

describe("a Move into the Pen she stands in", () => {
  it("is no journey", async () => {
    const bull = await aBull(
      "2069-05-01T04:00:00.000Z",
      "2069-05-01T04:00:00.000Z"
    );
    const manager = await as("manager", "2069-05-02T04:00:00.000Z");
    await manager.client.animals.move({
      tagNumber: bull.tagNumber,
      toPenId: otherPenId,
    });
    await expect(
      manager.client.animals.move({
        tagNumber: bull.tagNumber,
        toPenId: otherPenId,
      })
    ).rejects.toMatchObject({ data: { refusal: "already_in_that_pen" } });
  });
});

describe("a crossing a phone held", () => {
  it("is late when her State changed after it was made", async () => {
    const owner = await as("owner", "2069-06-01T00:00:00.000Z");
    const shed = await owner.client.sheds.create({ name: `${suffix}-cross` });
    const home = await owner.client.sheds.pens.create({
      shedId: shed.id,
      name: `ঘর ${suffix}`,
    });
    const across = await owner.client.sheds.pens.create({
      shedId: shed.id,
      name: `ওপারে ${suffix}`,
    });
    const heifer = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: home.id,
      source: "born",
      aliases: [],
    });
    // Six in the morning: she is found to be carrying.
    const vet = await as("owner", "2069-06-02T00:00:00.000Z");
    await vet.client.animals.setState({
      tagNumber: heifer.tagNumber,
      state: "pregnant_heifer",
    });
    // A phone walked her across to Fattening at five, and finds signal at eight.
    const phone = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2069-06-02T02:00:00.000Z"),
    });
    const sent = await phone.client.sync.batch({
      key: `held-crossing-${heifer.tagNumber}`,
      entries: [
        {
          id: `held-crossing-entry-${heifer.tagNumber}`,
          seq: 1,
          recordedAt: new Date("2069-06-01T23:00:00.000Z"),
          kind: "animal_move" as const,
          tagNumber: heifer.tagNumber,
          toPenId: across.id,
          toSide: "fattening" as const,
        },
      ],
    });
    expect(sent.results[0]?.outcome).not.toBe("applied");
  });
});

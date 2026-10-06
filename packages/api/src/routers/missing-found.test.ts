import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

// An animal not found is found again, or written off as Lost — never both at once; she comes back as she was, her
// calving with her; and one who leaves while missing is missing no more.

const suffix = `missing-found-${Date.now()}`;
let penId = "";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2068-01-01T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  penId = pen.id;
});

const aHeifer = async (expectedCalvingOn?: string) => {
  const owner = await as("owner", "2068-01-02T04:00:00.000Z");
  return await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: expectedCalvingOn ? "pregnant_heifer" : "heifer",
    penId,
    source: "bought",
    aliases: [],
    ...(expectedCalvingOn ? { expectedCalvingOn } : {}),
  });
};

const her = async (tagNumber: string) =>
  await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber },
    columns: { id: true, state: true, expectedCalvingAt: true },
  });

const missingOf = async (animalId: string) =>
  await scratchDb().query.missing.findFirst({
    where: { animalId },
    columns: { foundAt: true, writtenOffAt: true },
  });

const LOST = { cause: "রাতে গোয়াল থেকে চুরি", stolen: true, gdNumber: "জিডি ৪১২" };

describe("a Missing found and written off at once", () => {
  it("ends either found and here, or Lost and still to be found — never Lost and closed", async () => {
    const heifers = await Promise.all([1, 2, 3, 4, 5, 6].map(() => aHeifer()));
    const manager = await as("manager", "2068-01-05T04:00:00.000Z");
    for (const one of heifers) {
      // oxlint-disable-next-line no-await-in-loop -- one Missing at a time
      await manager.client.animals.notFound({ tagNumber: one.tagNumber });
    }
    const owner = await as("owner", "2068-01-20T04:00:00.000Z");
    const later = await as("manager", "2068-01-20T04:00:00.000Z");
    await Promise.allSettled(
      heifers.flatMap((one) => [
        owner.client.animals.writeOff({ tagNumber: one.tagNumber, ...LOST }),
        later.client.animals.found({ tagNumber: one.tagNumber }),
      ])
    );
    for (const one of heifers) {
      // oxlint-disable-next-line no-await-in-loop -- each read on its own
      const now = await her(one.tagNumber);
      // oxlint-disable-next-line no-await-in-loop
      const open = await missingOf(now?.id ?? "");
      const lostAndClosed = now?.state === "lost" && open?.foundAt !== null;
      expect(lostAndClosed).toBe(false);
    }
  });
});

describe("a pregnant heifer written off and found", () => {
  it("comes back with her Expected Calving", async () => {
    const carrying = await aHeifer("2068-06-01");
    const before = await her(carrying.tagNumber);
    const manager = await as("manager", "2068-02-01T04:00:00.000Z");
    await manager.client.animals.notFound({ tagNumber: carrying.tagNumber });
    const owner = await as("owner", "2068-02-15T04:00:00.000Z");
    await owner.client.animals.writeOff({
      tagNumber: carrying.tagNumber,
      ...LOST,
    });
    await owner.client.animals.found({ tagNumber: carrying.tagNumber });
    const after = await her(carrying.tagNumber);
    expect(after?.state).toBe("pregnant_heifer");
    expect(after?.expectedCalvingAt).toEqual(before?.expectedCalvingAt);
  });
});

describe("an animal who dies while missing", () => {
  it("is missing no more, and cannot be found", async () => {
    const heifer = await aHeifer();
    const manager = await as("manager", "2068-03-01T04:00:00.000Z");
    await manager.client.animals.notFound({ tagNumber: heifer.tagNumber });
    const later = await as("manager", "2068-03-03T04:00:00.000Z");
    await later.client.animals.recordMortality({
      photo: A_DEATH_PHOTO,
      tagNumber: heifer.tagNumber,
      kind: "died",
      cause: `খালের পাড়ে পাওয়া গেছে ${suffix}`,
      disposal: "buried",
    });
    const shown = await later.client.animals.get({
      tagNumber: heifer.tagNumber,
    });
    expect(shown.missing ?? null).toBeNull();
    await expect(
      later.client.animals.found({ tagNumber: heifer.tagNumber })
    ).rejects.toThrow();
  });
});

describe("the movement log", () => {
  it("says an animal written off as Lost leaving, and found coming back", async () => {
    const heifer = await aHeifer();
    const manager = await as("manager", "2068-04-01T04:00:00.000Z");
    await manager.client.animals.notFound({ tagNumber: heifer.tagNumber });
    const owner = await as("owner", "2068-04-15T04:00:00.000Z");
    await owner.client.animals.writeOff({
      tagNumber: heifer.tagNumber,
      ...LOST,
    });
    const later = await as("owner", "2068-04-20T04:00:00.000Z");
    await later.client.animals.found({ tagNumber: heifer.tagNumber });
    // A register for an inspector is written under the farm's registration.
    const keeper = await as("manager", "2068-04-20T04:00:00.000Z");
    const identity = await keeper.client.farm.identity();
    if (identity.registrationMissing) {
      await keeper.client.farm.setIdentity({
        registrationNumber: "DLS/SAV/2068/০০১",
      });
    }
    const reading = await as("owner", "2068-04-21T04:00:00.000Z");
    const log = await reading.client.inspectorView.print({
      register: "movement_log",
      format: "csv",
      from: "2068-04-01",
      to: "2068-04-30",
    });
    const kinds = (log.csv ?? "")
      .split("\r\n")
      .map((row) => row.split(","))
      .filter(([, tag]) => tag === heifer.tagNumber)
      .map((row) => row[2]);
    expect(kinds).toEqual(["lost", "found"]);
  });
});

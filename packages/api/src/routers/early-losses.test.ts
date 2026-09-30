import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Animals lost soon after they came, by who sold them and where: a death, a cull or a Diagnosis within thirty days of
// arrival, for the Owner to ask a trader about.

const suffix = `early-losses-${Date.now()}`;
const CAME = "2083-03-01T04:00:00.000Z";
const WINDOW = {
  targetWindowStart: "2083-06-01",
  targetWindowEnd: "2083-06-03",
};
const KARIM = `করিম ব্যাপারী ${suffix}`;
const RAHIM = `রহিম ব্যাপারী ${suffix}`;
const HAAT = `গাবতলী হাট ${suffix}`;

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2083-02-28T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `কোয়ারেন্টাইন ${suffix}`,
  });
  const manager = await as("manager", CAME);
  const trip = await manager.client.trips.record({
    wentTo: HAAT,
    brokerBdt: 0,
    transportBdt: 3000,
    wentOn: new Date(CAME),
  });
  const tags: string[] = [];
  for (const seller of [KARIM, KARIM, KARIM, RAHIM]) {
    // oxlint-disable-next-line no-await-in-loop -- one bull off the lorry after the other
    const bull = await manager.client.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: seller },
      purchasePriceBdt: 90_000,
      weightKg: 250,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(CAME),
      buyingTripId: trip.id,
      ...WINDOW,
    });
    tags.push(bull.tagNumber);
  }
  const [died = "", ill = "", , late = ""] = tags;
  // Karim's first died on day ten; his second the Vet found ill on day five; Rahim's died on day forty.
  const vet = await as("vet", "2083-03-06T04:00:00.000Z");
  await vet.client.diagnoses.record({
    animalTag: ill,
    disease: { bn: `নিউমোনিয়া ${suffix}` },
  });
  for (const [tagNumber, instant] of [
    [died, "2083-03-11T04:00:00.000Z"],
    [late, "2083-04-10T04:00:00.000Z"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one death after the other
    const recorder = await as("manager", instant);
    // oxlint-disable-next-line no-await-in-loop -- as above
    await recorder.client.animals.recordMortality({
      tagNumber,
      kind: "died",
      cause: "নিউমোনিয়া",
      disposal: "buried",
    });
  }
});

describe("early losses by seller and by haat", () => {
  it("names the seller and the haat whose animals died or fell ill within thirty days, and nobody else", async () => {
    const owner = await as("owner", "2083-05-01T04:00:00.000Z");
    const losses = await owner.client.intake.earlyLosses();
    expect(losses.bySeller).toEqual([
      { name: KARIM, bought: 3, died: 1, culled: 0, diagnosed: 1 },
    ]);
    expect(losses.byHaat).toEqual([
      { name: HAAT, bought: 4, died: 1, culled: 0, diagnosed: 1 },
    ]);
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2083-05-01T04:00:00.000Z");
    await expect(manager.client.intake.earlyLosses()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

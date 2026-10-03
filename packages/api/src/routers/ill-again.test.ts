import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Vet says how a Diagnosis ended — once, and puts it right with a reason — and an animal the Vet has diagnosed
// again and again within the farm's days is on the Manager's list, for the Owner to weigh.

const suffix = `ill-again-${Date.now()}`;

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** A heifer in a Pen of her own. */
const aHeifer = async (name: string) => {
  const owner = await as("owner", "2062-01-01T00:00:00.000Z");
  const shed = await owner.client.sheds.create({
    name: `${suffix}-${name}`,
  });
  const pen = await owner.client.sheds.pens.create({ shedId: shed.id, name });
  const heifer = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  return heifer.tagNumber;
};

/** The Vet diagnoses her on a day. */
const diagnosed = async (tag: string, day: string, disease: string) => {
  const vet = await as("vet", `${day}T05:00:00.000Z`);
  return vet.client.diagnoses.record({
    animalTag: tag,
    disease: { bn: disease },
  });
};

const illAgainOn = async (day: string) => {
  const manager = await as("manager", `${day}T06:00:00.000Z`);
  const home = await manager.client.home.get();
  return home.queue.illAgain;
};

describe("ill again and again", () => {
  it("lists an animal the Vet diagnosed three times within a year, with the latest", async () => {
    const tag = await aHeifer("বারবার পেন");
    await diagnosed(tag, "2062-02-01", "পাতলা পায়খানা");
    await diagnosed(tag, "2062-05-01", "নিউমোনিয়া");
    const twice = await illAgainOn("2062-05-02");
    expect(twice.map((one) => one.tag)).not.toContain(tag);
    await diagnosed(tag, "2062-09-01", "ম্যাস্টাইটিস");
    const thrice = await illAgainOn("2062-09-02");
    expect(thrice.find((one) => one.tag === tag)).toMatchObject({
      diagnoses: 3,
      lastDisease: "ম্যাস্টাইটিস",
    });
  });

  it("forgets a Diagnosis older than the farm's days", async () => {
    const tag = await aHeifer("পুরোনো পেন");
    await diagnosed(tag, "2062-01-02", "পাতলা পায়খানা");
    await diagnosed(tag, "2062-06-01", "নিউমোনিয়া");
    await diagnosed(tag, "2063-02-01", "ম্যাস্টাইটিস");
    const later = await illAgainOn("2063-02-02");
    expect(later.map((one) => one.tag)).not.toContain(tag);
  });
});

describe("how it ended", () => {
  it("is the Vet's to say once, and to put right with a reason", async () => {
    const tag = await aHeifer("সারা পেন");
    const made = await diagnosed(tag, "2062-03-01", "ক্ষুরে পচন");
    const vet = await as("vet", "2062-03-10T05:00:00.000Z");
    await vet.client.diagnoses.close({ id: made.id, outcome: "recovered" });
    const page = await vet.client.animals.get({ tagNumber: tag });
    expect(page.diagnoses[0]).toMatchObject({ outcome: "recovered" });

    await expect(
      vet.client.diagnoses.close({ id: made.id, outcome: "not_recovered" })
    ).rejects.toThrow("put it right");

    await vet.client.diagnoses.correct({
      id: made.id,
      changes: { outcome: { from: "recovered", to: "not_recovered" } },
      reason: "আবার খোঁড়াচ্ছে",
    });
    const after = await vet.client.animals.get({ tagNumber: tag });
    expect(after.diagnoses[0]).toMatchObject({ outcome: "not_recovered" });
  });

  it("is not the Manager's to say", async () => {
    const tag = await aHeifer("ম্যানেজার পেন");
    const made = await diagnosed(tag, "2062-03-01", "কাশি");
    const manager = await as("manager", "2062-03-10T05:00:00.000Z");
    await expect(
      manager.client.diagnoses.close({ id: made.id, outcome: "recovered" })
    ).rejects.toThrow();
  });
});

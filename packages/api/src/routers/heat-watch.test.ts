import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The heat watch: an open cow the farm expects in heat and nobody has seen, on the Manager's queue and the Vet's page.

const suffix = `heat-watch-${Date.now()}`;

type Role = "owner" | "manager" | "staff" | "vet";
const as = (role: Role, instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** A cow on the opening register, in milk, who calved on a day, in a Pen of her own. */
const aCowWhoCalved = async (name: string, calvedOn: string) => {
  const owner = await as("owner", "2063-06-01T00:00:00.000Z");
  const shed = await owner.client.herd.createShed({
    name: `${suffix}-${name}`,
  });
  await owner.client.herd.createPen({ shedId: shed.id, name });
  const imported = await owner.client.animals.importRegister({
    csv: [
      "sex,side,state,pen,source,calved_at",
      `female,dairy,milking,${name},bought,${calvedOn}`,
    ].join("\n"),
  });
  return imported.imported[0]?.tagNumber ?? "";
};

const watchedOn = async (instant: string, role: Role = "manager") => {
  const client = await as(role, instant);
  return client.client.breeding.heatWatch();
};

describe("the heat watch", () => {
  it("names an open cow sixty days from calving with no heat seen, and not before", async () => {
    const tag = await aCowWhoCalved(`নজর পেন ক ${suffix}`, "2063-04-10");
    const before = await watchedOn("2063-06-08T04:00:00.000Z");
    expect(before.map((one) => one.tag)).not.toContain(tag);
    const after = await watchedOn("2063-06-10T04:00:00.000Z");
    expect(after.find((one) => one.tag === tag)).toMatchObject({
      because: "no_heat",
      daysSinceCalving: 61,
      lastSignAt: null,
    });
  });

  it("takes her off once she is seen in heat, and is on the Manager's home", async () => {
    const tag = await aCowWhoCalved(`নজর পেন খ ${suffix}`, "2063-04-01");
    const manager = await as("manager", "2063-06-10T04:00:00.000Z");
    const home = await manager.client.home.manager();
    expect(home.queue.heatWatch.map((one) => one.tag)).toContain(tag);

    await manager.client.observations.record({ tagNumber: tag, saw: "heat" });
    const after = await watchedOn("2063-06-10T05:00:00.000Z");
    expect(after.map((one) => one.tag)).not.toContain(tag);
  });

  it("is the Vet's to read as well, and not Barn Staff's", async () => {
    await expect(
      watchedOn("2063-06-10T04:00:00.000Z", "vet")
    ).resolves.toBeInstanceOf(Array);
    await expect(
      watchedOn("2063-06-10T04:00:00.000Z", "staff")
    ).rejects.toThrow();
  });
});

describe("a heifer not yet served", () => {
  /** A heifer born on a day, of a breed deshi or not, in a Pen of her own. */
  const aHeifer = async (name: string, bornOn: string, deshi: boolean) => {
    const owner = await as("owner", "2063-06-01T00:00:00.000Z");
    const shed = await owner.client.herd.createShed({
      name: `${suffix}-${name}`,
    });
    const pen = await owner.client.herd.createPen({ shedId: shed.id, name });
    const breed = await owner.client.breeds.add({
      nameBn: `${deshi ? "দেশি" : "সংকর"} ${name}`,
      deshi,
    });
    const heifer = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
      breedId: breed.id,
      birthDate: new Date(`${bornOn}T00:00:00.000Z`),
    });
    return heifer.tagNumber;
  };

  it("names a crossbred heifer at 18 months, and a deshi one only at 30", async () => {
    const cross = await aHeifer(`সংকর পেন ${suffix}`, "2061-11-01", false);
    const deshi = await aHeifer(`দেশি পেন ${suffix}`, "2061-11-01", true);
    const listed = await watchedOn("2063-06-10T04:00:00.000Z");
    expect(listed.find((one) => one.tag === cross)).toMatchObject({
      because: "not_served",
      ageMonths: 19,
      ageEstimated: false,
      dueAtMonths: 18,
    });
    expect(listed.map((one) => one.tag)).not.toContain(deshi);
  });
});

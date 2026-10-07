import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Shed is named once on the farm and a Pen once in its Shed, whatever the capitals or the keyboard — and a name taken
// is refused in words the Manager can read, not as the database's error.

const suffix = `shed-names-${Date.now()}`;

const manager = async () => {
  const made = await createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock("2086-03-01T04:00:00.000Z"),
  });
  return made.client;
};

describe("a shed's name", () => {
  it("is refused a second time, whatever the capitals, in words", async () => {
    const who = await manager();
    await who.sheds.create({ name: `Shed A ${suffix}` });
    await expect(
      who.sheds.create({ name: `shed a ${suffix}` })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "shed_name_taken" },
    });
    const other = await who.sheds.create({ name: `Shed B ${suffix}` });
    await expect(
      who.sheds.rename({ id: other.id, name: `SHED A ${suffix}` })
    ).rejects.toMatchObject({ data: { refusal: "shed_name_taken" } });
  });
});

describe("a pen's name", () => {
  it("is refused a second time in its shed, however the keyboard spelled it, and taken in another", async () => {
    const who = await manager();
    const north = await who.sheds.create({ name: `উত্তর ${suffix}` });
    const south = await who.sheds.create({ name: `দক্ষিণ ${suffix}` });
    await who.sheds.pens.create({
      shedId: north.id,
      name: `বাড়ি ${suffix}`,
    });
    await expect(
      who.sheds.pens.create({
        shedId: north.id,
        name: `বাড়ি ${suffix}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "pen_name_taken" },
    });
    await expect(
      who.sheds.pens.create({ shedId: south.id, name: `বাড়ি ${suffix}` })
    ).resolves.toBeDefined();
  });
});

import { MASTITIS } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { aMonthOn } from "../test/carrying";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// How the dairy herd turns over and how often it falls sick: a cow sold to a butcher is a cow gone from the milking herd
// as surely as one culled by a Mortality, and a mastitis the Vet diagnoses is counted over the cows kept.

const suffix = `health-${Date.now()}`;

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

describe("the dairy herd's year", () => {
  it("counts a cow sold off the Dairy side as gone, and mastitis over the cows kept", async () => {
    const owner = await as("owner", "2093-01-01T04:00:00.000Z");
    const shed = await owner.client.sheds.create({ name: suffix });
    const pen = await owner.client.sheds.pens.create({
      shedId: shed.id,
      name: `দোহন ${suffix}`,
    });
    const cows: string[] = [];
    for (const alias of ["ক", "খ"]) {
      // oxlint-disable-next-line no-await-in-loop -- one cow after another onto the register
      const cow = await owner.client.animals.register({
        sex: "female",
        side: "dairy",
        state: "heifer",
        penId: pen.id,
        source: "born",
        aliases: [`${alias} ${suffix}`],
      });
      // oxlint-disable-next-line no-await-in-loop
      await owner.client.animals.setState({
        tagNumber: cow.tagNumber,
        state: "pregnant_heifer",
        expectedCalvingOn: aMonthOn(owner),
      });
      // oxlint-disable-next-line no-await-in-loop
      await owner.client.animals.setState({
        tagNumber: cow.tagNumber,
        state: "milking",
      });
      cows.push(cow.tagNumber);
    }

    const manager = await as("manager", "2093-07-02T04:00:00.000Z");
    await manager.client.sales.record({
      tagNumber: cows[0] ?? "",
      buyer: { name: `কসাই ${suffix}` },
      priceMoney: 90_000,
      weightKg: 380,
      destination: `হাট ${suffix}`,
      vehicle: `ঢাকা মেট্রো ${suffix}`,
      driver: `চালক ${suffix}`,
    });
    const vet = await as("vet", "2093-08-01T04:00:00.000Z");
    await vet.client.diagnoses.record({
      animalTag: cows[1] ?? "",
      disease: { bn: MASTITIS },
    });

    const reading = await as("owner", "2093-12-31T04:00:00.000Z");
    const health = await reading.client.animals.herdHealth();
    expect(health.turnover).toMatchObject({ sold: 1, died: 0, crossed: 0 });
    expect(health.turnover.cowYears).toBeGreaterThan(1);
    expect(health.sickness.diseases).toEqual([{ disease: MASTITIS, count: 1 }]);
    expect(health.sickness.mastitisPerHundredCows).not.toBeNull();
  });

  it("is not Barn Staff's to read", async () => {
    const staff = await createTestClient(appRouter, { as: "staff" });
    await expect(staff.client.animals.herdHealth()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

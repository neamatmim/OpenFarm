import { DAY, FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Dry is her State, and the next calving overwrites it: without the day she was dried off kept for itself, nobody can
 * say how long she milked or how long she stood dry — and a dry period of three weeks costs the next Lactation, one of
 * four months costs the feed. The day is written when she goes Dry, and both are read from it.
 */
const suffix = `dry-off-date-${Date.now()}`;

describe("the day a cow was dried off", () => {
  it("is kept past her next calving: how long she milked, and how long she stood dry", async () => {
    const clock = new FakeClock("2087-05-01T06:00:00.000Z");
    // Signed in afresh after each stretch of days: a session does not last a dry period.
    const signIn = () => createTestClient(appRouter, { as: "owner", clock });
    let owner = await signIn();
    const shed = await owner.client.sheds.create({ name: suffix });
    const pen = await owner.client.sheds.pens.create({
      shedId: shed.id,
      name: `গাভী ${suffix}`,
    });
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    const { tagNumber } = cow;
    await owner.client.animals.setState({
      tagNumber,
      state: "pregnant_heifer",
    });
    await owner.client.animals.setState({
      tagNumber,
      state: "milking",
      calvedAt: new Date(clock.now().getTime() - 300 * DAY),
    });

    await owner.client.animals.setState({ tagNumber, state: "dry" });
    clock.advance(20 * DAY);
    owner = await signIn();
    await expect(
      owner.client.milk.forAnimal({ tagNumber })
    ).resolves.toMatchObject({
      lactations: [
        {
          lactationNumber: 1,
          driedAt: new Date("2087-05-01T06:00:00.000Z"),
          lactationDays: 300,
          dryDays: 20,
          stillDry: true,
        },
      ],
    });

    clock.advance(35 * DAY);
    owner = await signIn();
    await owner.client.animals.setState({ tagNumber, state: "milking" });
    const after = await owner.client.milk.forAnimal({ tagNumber });
    expect(after.lactations).toMatchObject([
      { lactationNumber: 2, driedAt: null, dryDays: null },
      { lactationNumber: 1, lactationDays: 300, dryDays: 55, stillDry: false },
    ]);

    // And the herd's: one dry period ended this year, of fifty-five days; one Lactation dried off, of three hundred.
    clock.advance(DAY);
    owner = await signIn();
    const fertility = await owner.client.breeding.fertility();
    expect(fertility.dryOffs).toMatchObject({
      dryPeriodDays: 55,
      dryPeriods: 1,
      lactationDays: 300,
      lactations: 1,
      outsideTarget: [],
    });
  });
});

import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

// A cull cow fattened for Eid keeps her years in milk on the Dairy side: the death rate counts each of her days on the
// Side she stood on that day, and her death on the Side she died on.

const suffix = `by-side-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

describe("deaths among grown animals, by the Side of each day", () => {
  it("counts a cow's months in milk on the Dairy side after she is crossed to Fattening", async () => {
    const owner = await as("owner", "2090-01-01T04:00:00.000Z");
    const shed = await owner.client.sheds.create({ name: suffix });
    const dairy = await owner.client.sheds.pens.create({
      shedId: shed.id,
      name: `গাভী পেন ${suffix}`,
    });
    const fattening = await owner.client.sheds.pens.create({
      shedId: shed.id,
      name: `ফ্যাটেনিং পেন ${suffix}`,
    });
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: dairy.id,
      source: "born",
      aliases: [`ক ${suffix}`],
    });

    // A cow the whole of 2090, and of 2091 until 2 July; then a bull for Eid, until she died on 1 December.
    const crossing = await as("owner", "2091-07-02T04:00:00.000Z");
    await crossing.client.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: fattening.id,
      toSide: "fattening",
      reason: "not productive",
    });
    const manager = await as("manager", "2091-12-01T04:00:00.000Z");
    await manager.client.animals.recordMortality({
      photo: A_DEATH_PHOTO,
      tagNumber: cow.tagNumber,
      kind: "died",
      cause: `পেট ফাঁপা ${suffix}`,
      disposal: "buried",
    });

    const reading = await as("owner", "2092-01-01T04:00:00.000Z");
    const deaths = await reading.client.animals.deaths();
    expect(deaths.dairy).toMatchObject({ died: 0, headYears: 0.5 });
    expect(deaths.fattening).toMatchObject({ died: 1, headYears: 0.4 });
  });
});

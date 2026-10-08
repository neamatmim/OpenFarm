import { goesNow } from "@OpenFarm/domain";
import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Several animals in one Pen seen with sores on the mouth or feet within the farm's hours: the Owner and the Manager
// are told at once, once for the Pen, in words that say what was seen and never a disease.

const suffix = `sores-${Date.now()}`;
const SORES = "mouth_foot_sores";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** A Pen of its own with this many heifers in it. */
const aPen = async (name: string, heifers: number) => {
  const owner = await as("owner", "2061-01-01T00:00:00.000Z");
  const shed = await owner.client.sheds.create({
    name: `${suffix}-${name}`,
  });
  const pen = await owner.client.sheds.pens.create({ shedId: shed.id, name });
  const tags: string[] = [];
  for (let one = 0; one < heifers; one += 1) {
    // One after the other, so the Tag Numbers come in order.
    // oxlint-disable-next-line no-await-in-loop
    const heifer = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    tags.push(heifer.tagNumber);
  }
  return { name, tags };
};

/** Somebody reports sores on her, at an instant. */
const seenWithSores = async (tag: string, instant: string) => {
  const manager = await as("manager", instant);
  return manager.client.observations.record({ tagNumber: tag, saw: SORES });
};

const sweepAt = async (instant: string) => {
  const manager = await as("manager", instant);
  await manager.client.alerts.sweep();
};

const toldOf = async (pen: string, role: "owner" | "manager") => {
  const rows = await scratchDb().query.alert.findMany({
    where: { kind: "pen_sores_seen", userId: thePerson(role).id },
    columns: { params: true },
  });
  return rows
    .map((row) => row.params as { pen: string; animals: number })
    .filter((one) => one.pen === pen);
};

describe("sores in one Pen", () => {
  it("goes at once, not with the evening's post", () => {
    expect(goesNow("pen_sores_seen")).toBe(true);
  });

  it("tells the Owner and the Manager once three animals are seen within two days, and only once", async () => {
    const pen = await aPen(`ঘা পেন ক ${suffix}`, 4);
    const [first, second, third, fourth] = pen.tags;
    await seenWithSores(first ?? "", "2061-01-02T02:00:00.000Z");
    await seenWithSores(second ?? "", "2061-01-02T08:00:00.000Z");
    await sweepAt("2061-01-02T09:00:00.000Z");
    expect(await toldOf(pen.name, "owner")).toHaveLength(0);

    await seenWithSores(third ?? "", "2061-01-03T02:00:00.000Z");
    await sweepAt("2061-01-03T03:00:00.000Z");
    expect(await toldOf(pen.name, "owner")).toEqual([
      expect.objectContaining({ animals: 3 }),
    ]);
    expect(await toldOf(pen.name, "manager")).toHaveLength(1);

    // A fourth the next morning is the same Pen, already told.
    await seenWithSores(fourth ?? "", "2061-01-03T20:00:00.000Z");
    await sweepAt("2061-01-03T21:00:00.000Z");
    expect(await toldOf(pen.name, "owner")).toHaveLength(1);
  });

  it("says nothing of one animal seen three times, or of sores spread over more than the farm's hours", async () => {
    const pen = await aPen(`ঘা পেন খ ${suffix}`, 3);
    const [first, second, third] = pen.tags;
    await seenWithSores(first ?? "", "2061-02-01T02:00:00.000Z");
    await seenWithSores(first ?? "", "2061-02-01T05:00:00.000Z");
    await seenWithSores(first ?? "", "2061-02-01T08:00:00.000Z");
    await sweepAt("2061-02-01T09:00:00.000Z");
    expect(await toldOf(pen.name, "owner")).toHaveLength(0);

    await seenWithSores(second ?? "", "2061-02-04T02:00:00.000Z");
    await seenWithSores(third ?? "", "2061-02-06T02:00:00.000Z");
    await sweepAt("2061-02-06T03:00:00.000Z");
    expect(await toldOf(pen.name, "owner")).toHaveLength(0);
  });

  it("is taken down by the sweep once the sighting it began from is withdrawn", async () => {
    const pen = await aPen(`ঘা পেন ঘ ${suffix}`, 3);
    const [first, second, third] = pen.tags;
    const wrong = await seenWithSores(first ?? "", "2061-04-02T02:00:00.000Z");
    await seenWithSores(second ?? "", "2061-04-02T03:00:00.000Z");
    await seenWithSores(third ?? "", "2061-04-02T04:00:00.000Z");
    await sweepAt("2061-04-02T05:00:00.000Z");
    const showingOf = async (instant: string) => {
      const owner = await as("owner", instant);
      const mine = await owner.client.alerts.mine();
      return mine.filter(
        (one) =>
          one.kind === "pen_sores_seen" &&
          (one.params as { pen?: string }).pen === pen.name
      );
    };
    expect(await showingOf("2061-04-02T05:30:00.000Z")).toHaveLength(1);

    const manager = await as("manager", "2061-04-02T06:00:00.000Z");
    await manager.client.observations.withdraw({
      id: wrong.id,
      reason: `অন্য গাভী ছিল ${suffix}`,
      changes: { withdrawn: { from: false, to: true } },
    });
    await sweepAt("2061-04-02T07:00:00.000Z");

    expect(await showingOf("2061-04-02T07:30:00.000Z")).toEqual([]);
  });

  it("counts by the farm's own number, which the Manager may set", async () => {
    const manager = await as("manager", "2061-03-01T00:00:00.000Z");
    await manager.client.farm.setParameters({ soresTellAnimals: 2 });
    const pen = await aPen(`ঘা পেন গ ${suffix}`, 2);
    const [first, second] = pen.tags;
    await seenWithSores(first ?? "", "2061-03-02T02:00:00.000Z");
    await seenWithSores(second ?? "", "2061-03-02T04:00:00.000Z");
    await sweepAt("2061-03-02T05:00:00.000Z");
    expect(await toldOf(pen.name, "owner")).toHaveLength(1);
    await manager.client.farm.setParameters({ soresTellAnimals: 3 });
  });
});

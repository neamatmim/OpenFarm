import { FakeClock, theFarm, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { herRecord } from "./animal-record";
import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";

// Her record, read as every reader of it reads it: one bought in, one born here, and one who has gone. The facts these
// tests are about — how she arrived, where she stood, how she left — are the ones her page, her Animal Passport and the
// registers each used to work out for themselves.

const suffix = `${Date.now()}`;
const AT = "2033-04-10T04:00:00.000Z";
const LATER = "2033-06-20T04:00:00.000Z";

const as = async (who: "owner" | "manager", at: string) => {
  const { client } = await createTestClient(appRouter, {
    as: who,
    clock: new FakeClock(at),
  });
  return client;
};

/** Her record as the farm holds it, read without a router, the way its callers read it. */
const recordOf = (tagNumber: string, now: string) =>
  herRecord(scratchDb(), theFarm().id, tagNumber, new Date(now));

let world: {
  quarantine: string;
  fattening: string;
  dairy: string;
  otherDairy: string;
};

beforeAll(async () => {
  const owner = await as("owner", AT);
  const shed = await owner.herd.createShed({ name: `রেকর্ড ${suffix}` });
  const pen = async (name: string) => {
    const made = await owner.herd.createPen({
      shedId: shed.id,
      name: `${name} ${suffix}`,
    });
    return made.id;
  };
  world = {
    quarantine: await pen("কোয়ারেন্টিন"),
    fattening: await pen("মোটাতাজা"),
    dairy: await pen("দুধ ক"),
    otherDairy: await pen("দুধ খ"),
  };
});

describe("her record", () => {
  it("says a bought animal arrived at her Intake, and where she has stood since", async () => {
    const manager = await as("manager", AT);
    const taken = await manager.intake.record({
      penId: world.quarantine,
      sex: "male",
      seller: { name: `বেপারী ${suffix}`, address: "সাভার হাট" },
      purchasePriceBdt: 90_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      breed: "শাহীওয়াল",
    });
    const walked = await as("manager", LATER);
    await walked.animals.move({
      tagNumber: taken.tagNumber,
      toPenId: world.fattening,
    });

    const her = await recordOf(taken.tagNumber, LATER);
    expect(her.arrival).toMatchObject({ how: "bought", at: new Date(AT) });
    expect(her.intake).toMatchObject({
      estimatedAgeMonths: 20,
      seller: { name: `বেপারী ${suffix}` },
    });
    expect(her.exit).toBeNull();
    // Oldest first, the last one still open: she is standing in it.
    expect(her.penSpells.map((spell) => [spell.pen.name, spell.until])).toEqual(
      [
        [`কোয়ারেন্টিন ${suffix}`, new Date(LATER)],
        [`মোটাতাজা ${suffix}`, null],
      ]
    );
    // Counted from her Intake, not from the day she was written down.
    expect(her.daysOnFeed).toBe(71);
    expect(her.moreThanShown).toBe(false);
  });

  it("says an animal the farm registered was already here, and reads only as deep as it is asked", async () => {
    const manager = await as("manager", AT);
    const cow = await manager.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.dairy,
      source: "born",
      aliases: [],
    });
    const walked = await as("manager", LATER);
    await walked.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: world.otherDairy,
    });

    const her = await recordOf(cow.tagNumber, LATER);
    expect(her.arrival).toMatchObject({ how: "already_here" });
    expect(her.daysOnFeed).toBeNull();
    // Asked for one Move, it gives one and says there was more.
    const shallow = await herRecord(
      scratchDb(),
      theFarm().id,
      cow.tagNumber,
      new Date(LATER),
      { moves: 1 }
    );
    expect(shallow.moves).toHaveLength(1);
    expect(shallow.moreThanShown).toBe(true);
    // How she arrived is a fact about her, not one a shallow read can lose.
    expect(shallow.arrival).toEqual(her.arrival);
  });

  it("says how a cow who has gone left, and ends her last Pen Spell when she went", async () => {
    const manager = await as("manager", AT);
    const cow = await manager.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.dairy,
      source: "born",
      aliases: [],
    });
    const later = await as("manager", LATER);
    await later.animals.recordMortality({
      tagNumber: cow.tagNumber,
      kind: "culled",
      cause: "বারবার ওলান প্রদাহ",
      disposal: "buried",
    });

    const her = await recordOf(cow.tagNumber, LATER);
    expect(her.exit).toMatchObject({
      how: "culled",
      at: new Date(LATER),
    });
    expect(her.mortality).toMatchObject({
      kind: "culled",
      cause: "বারবার ওলান প্রদাহ",
      disposal: "buried",
    });
    expect(her.sale).toBeNull();
    // A paper asked for after she has gone never says she stands in a Pen still.
    expect(her.penSpells.at(-1)?.until).toEqual(new Date(LATER));
    // And who wrote it down, which her page shows beside how she went.
    expect(her.mortality?.recorder?.name).toBeTruthy();
    expect(her.mortality?.disposalNote).toBeNull();
  });

  it("reads deep enough for her page: both ends of a Move, and the work that walked her", async () => {
    const manager = await as("manager", AT);
    const cow = await manager.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.dairy,
      source: "born",
      aliases: [],
    });
    const later = await as("manager", LATER);
    await later.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: world.otherDairy,
    });

    const her = await recordOf(cow.tagNumber, LATER);

    // Where she came from as well as where she went: a Move with one end is a Move nobody can account for.
    expect(her.moves.at(0)).toMatchObject({
      fromPen: { name: `দুধ ক ${suffix}` },
      toPen: { name: `দুধ খ ${suffix}` },
      completion: null,
    });
    // And the one that brought her in, which has no other end to have come from.
    expect(her.moves.at(-1)).toMatchObject({
      fromPen: null,
      toPen: { name: `দুধ ক ${suffix}` },
    });
  });
});

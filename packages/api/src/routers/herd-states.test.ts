import { penAssignment } from "@OpenFarm/db/schema/herd";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

// Her State set by hand says what it means — carrying, with a day she is expected to calve, or not carrying, with
// none — her Tag Number says where she came from, and a Move refused says why in the reader's words.

const suffix = `herd-states-${Date.now()}`;
let penId = "";
let otherPenId = "";
let penName = "";

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2071-01-01T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  penName = `পেন ${suffix}`;
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: penName,
  });
  const other = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `অন্য ${suffix}`,
  });
  penId = pen.id;
  otherPenId = other.id;
});

const aHeifer = async (expectedCalvingOn?: string) => {
  const owner = await as("owner", "2071-01-02T04:00:00.000Z");
  return await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: expectedCalvingOn ? "pregnant_heifer" : "heifer",
    penId,
    source: "born",
    aliases: [],
    ...(expectedCalvingOn ? { expectedCalvingOn } : {}),
  });
};

const her = async (tagNumber: string) =>
  await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber },
    columns: { state: true, expectedCalvingAt: true },
  });

describe("a State set by hand", () => {
  it("not carrying, forgets the calving she was expected to make", async () => {
    const carrying = await aHeifer("2071-06-01");
    const owner = await as("owner", "2071-02-01T04:00:00.000Z");
    await owner.client.animals.setState({
      tagNumber: carrying.tagNumber,
      state: "heifer",
    });
    expect(await her(carrying.tagNumber)).toMatchObject({
      state: "heifer",
      expectedCalvingAt: null,
    });
  });

  it("carrying, says when she is expected to calve, or is refused", async () => {
    const heifer = await aHeifer();
    const owner = await as("owner", "2071-02-01T04:00:00.000Z");
    await expect(
      owner.client.animals.setState({
        tagNumber: heifer.tagNumber,
        state: "pregnant_heifer",
      })
    ).rejects.toMatchObject({ data: { refusal: "expected_calving_needed" } });
    await owner.client.animals.setState({
      tagNumber: heifer.tagNumber,
      state: "pregnant_heifer",
      expectedCalvingOn: "2071-08-01",
    });
    const now = await her(heifer.tagNumber);
    expect(now?.expectedCalvingAt).not.toBeNull();
  });
});

describe("a Tag Number in the opening register", () => {
  it("keeps the D- of a bull born on the farm, now on the Fattening side", async () => {
    const owner = await as("owner", "2071-03-01T04:00:00.000Z");
    const result = await owner.client.animals.importRegister({
      csv: [
        "tag,sex,side,state,pen,source",
        `D-7101,male,fattening,fattening,${penName},born`,
      ].join("\n"),
    });
    expect(result.imported.map((one) => one.tagNumber)).toEqual(["D-7101"]);
  });

  it("claimed twice at once, tells the second it is taken", async () => {
    const owner = await as("owner", "2071-03-02T04:00:00.000Z");
    const claim = () =>
      owner.client.animals.importRegister({
        csv: [
          "tag,sex,side,state,pen,source",
          `D-7202,female,dairy,heifer,${penName},born`,
        ].join("\n"),
      });
    const both = await Promise.all([claim(), claim()]);
    expect(both.flatMap((one) => one.imported)).toHaveLength(1);
    expect(both.flatMap((one) => one.failed.map((row) => row.refusal))).toEqual(
      ["tag_taken"]
    );
  });
});

describe("a Move refused", () => {
  it("says why in a word the screen can say", async () => {
    const heifer = await aHeifer();
    const manager = await as("manager", "2071-04-01T04:00:00.000Z");
    await manager.client.animals.recordMortality({
      photo: A_DEATH_PHOTO,
      tagNumber: heifer.tagNumber,
      kind: "died",
      cause: `জ্বর ${suffix}`,
      disposal: "buried",
    });
    await expect(
      manager.client.animals.move({
        tagNumber: heifer.tagNumber,
        toPenId: otherPenId,
      })
    ).rejects.toMatchObject({ data: { refusal: "she_is_gone" } });

    const standing = await aHeifer();
    await createTestClient(appRouter, { as: "staff" });
    await scratchDb()
      .insert(penAssignment)
      .values({
        id: `pa-${suffix}`,
        farmId: theFarm().id,
        userId: thePerson("staff").id,
        penId,
      })
      .onConflictDoNothing();
    const staff = await as("staff", "2071-04-02T04:00:00.000Z");
    await expect(
      staff.client.animals.move({
        tagNumber: standing.tagNumber,
        toPenId: otherPenId,
      })
    ).rejects.toMatchObject({ data: { refusal: "pen_not_yours" } });
  });
});

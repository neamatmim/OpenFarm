import { penAssignment } from "@OpenFarm/db/schema/herd";
import { standardPlaybook } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A cow calves at two in the morning with no Calving record open: the milker on the night round opens it about her
// from her page, and records the calving there — nobody wakes the Manager to raise it.

const suffix = `${Date.now()}`;
const NIGHT = "2033-05-10T20:00:00.000Z";

const as = (role: "owner" | "manager" | "staff") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(NIGHT) });

let calvingPen = "";
let otherPen = "";
const tags = { carrying: "", elsewhere: "", open: "", bull: "" };

beforeAll(async () => {
  const owner = await as("owner");
  const shed = await owner.client.sheds.create({ name: `calved-${suffix}` });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `প্রসব পেন ${suffix}`,
  });
  calvingPen = pen.id;
  const other = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `অন্য পেন ${suffix}`,
  });
  otherPen = other.id;
  await as("staff");
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-calved-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const cow = (penId: string, state: "pregnant_heifer" | "heifer") =>
    owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state,
      penId,
      source: "bought",
      aliases: [],
      ...(state === "pregnant_heifer"
        ? { expectedCalvingOn: "2033-05-20" }
        : {}),
    });
  const carrying = await cow(calvingPen, "pregnant_heifer");
  const elsewhere = await cow(otherPen, "pregnant_heifer");
  const open = await cow(calvingPen, "heifer");
  tags.carrying = carrying.tagNumber;
  tags.elsewhere = elsewhere.tagNumber;
  tags.open = open.tagNumber;
  const bull = await owner.client.animals.register({
    sex: "male",
    side: "dairy",
    state: "heifer",
    penId: calvingPen,
    source: "born",
    aliases: [],
  });
  tags.bull = bull.tagNumber;
});

describe("the calving record opened about her", () => {
  it("is refused while the farm has adopted no Calving record", async () => {
    const staff = await as("staff");
    await expect(
      staff.client.work.openCalvingRecord({ tagNumber: tags.carrying })
    ).rejects.toMatchObject({ data: { refusal: "no_calving_record" } });
  });

  it("is opened by the milker for a cow in his Pen, about her alone, and records her calving", async () => {
    const owner = await as("owner");
    await owner.client.sops.create({
      content: standardPlaybook({}).calvingRecord,
    });
    const staff = await as("staff");
    const { id } = await staff.client.work.openCalvingRecord({
      tagNumber: tags.carrying,
    });
    // Asked twice — two phones, a second tap — it is the same work.
    const again = await staff.client.work.openCalvingRecord({
      tagNumber: tags.carrying,
    });
    expect(again.id).toBe(id);
    const board = await staff.client.work.get({ id });
    expect(board.animals.map((one) => one.tagNumber)).toEqual([tags.carrying]);
    expect(board.penId).toBe(calvingPen);
    await staff.client.work.claim({ id });
    await staff.client.work.completeStep({
      instanceId: id,
      stepId: "calved",
      animalTag: tags.carrying,
      evidence: [
        "2033-05-10T19:40:00.000Z",
        "unassisted",
        "female",
        "alive",
        "",
        "",
      ],
    });
    const her = await staff.client.animals.get({ tagNumber: tags.carrying });
    expect(her.state).toBe("milking");
    expect(her.calvings).toHaveLength(1);
  });

  it("is opened afresh once the last was closed on not calved yet", async () => {
    const owner = await as("owner");
    const waiting = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "pregnant_heifer",
      penId: calvingPen,
      source: "bought",
      aliases: [],
      expectedCalvingOn: "2033-05-20",
    });
    const staff = await as("staff");
    const first = await staff.client.work.openCalvingRecord({
      tagNumber: waiting.tagNumber,
    });
    await staff.client.work.claim({ id: first.id });
    await staff.client.work.completeStep({
      instanceId: first.id,
      stepId: "calved",
      animalTag: waiting.tagNumber,
      evidence: [],
      skipReason: "এখনো বাচ্চা দেয়নি",
    });
    await staff.client.work.complete({ id: first.id });
    // A false alarm at midnight, and the real thing at four: the work closed is no use to her now.
    const second = await staff.client.work.openCalvingRecord({
      tagNumber: waiting.tagNumber,
    });
    expect(second.id).not.toBe(first.id);
  });

  it("is refused for a cow outside his Pens", async () => {
    const staff = await as("staff");
    await expect(
      staff.client.work.openCalvingRecord({ tagNumber: tags.elsewhere })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // The Manager's reach is the whole farm.
    const manager = await as("manager");
    await expect(
      manager.client.work.openCalvingRecord({ tagNumber: tags.elsewhere })
    ).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("is refused for an animal that cannot calve", async () => {
    const staff = await as("staff");
    for (const tagNumber of [tags.open, tags.bull]) {
      // oxlint-disable-next-line no-await-in-loop -- one after the other, each refused on its own
      await expect(
        staff.client.work.openCalvingRecord({ tagNumber })
      ).rejects.toMatchObject({
        data: { refusal: "calving_of_a_cow_not_in_calf" },
      });
    }
  });
});

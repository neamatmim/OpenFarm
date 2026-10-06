import { inArray } from "@OpenFarm/db/operators";
import { milkRecord } from "@OpenFarm/db/schema/milk";
import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A cow giving well under her own week is named to the Manager: her litres a milking over the last two days against the
// week before, whatever became of the milk.

const suffix = `giving-less-${Date.now()}`;

let milkingId = "";

type Role = "owner" | "manager" | "staff";
const as = (role: Role, instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2064-01-01T00:00:00.000Z");
  const milking = await owner.client.sops.create({
    content: standardPlaybook().morningMilking,
  });
  milkingId = milking.definitionId;
});

/** A cow on the opening register, in milk since long ago, in a Pen of her own. */
const aCowInMilk = async (name: string) => {
  const owner = await as("owner", "2064-01-01T00:00:00.000Z");
  const shed = await owner.client.sheds.create({
    name: `${suffix}-${name}`,
  });
  const pen = await owner.client.sheds.pens.create({ shedId: shed.id, name });
  const imported = await owner.client.animals.importRegister({
    csv: [
      "sex,side,state,pen,source,calved_at",
      `female,dairy,milking,${name},bought,2063-11-01`,
    ].join("\n"),
  });
  return { penId: pen.id, tag: imported.imported[0]?.tagNumber ?? "" };
};

/** The morning milking among the day's work. */
const theMilking = <Row extends { definitionId: string }>(rows: Row[]) =>
  rows.find((row) => row.definitionId === milkingId);

/** Her morning milking on each of nine days from the 1st of February, giving what `litres` says for the day. */
const milkNineDays = async (
  cow: { penId: string; tag: string },
  litres: (day: number) => number
) => {
  for (let day = 1; day <= 9; day += 1) {
    const at = `2064-02-0${day}T00:00:00.000Z`;
    // Day after day, as the farm lives them.
    // oxlint-disable-next-line no-await-in-loop
    const manager = await as("manager", at);
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.work.ensureDue();
    // oxlint-disable-next-line no-await-in-loop
    const today = await manager.client.work.today({ penId: cow.penId });
    const work = theMilking(today);
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.work.claim({ id: work?.id ?? "" });
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.work.completeStep({
      instanceId: work?.id ?? "",
      stepId: "milk",
      animalTag: cow.tag,
      evidence: [litres(day)],
    });
  }
};

const givingLessOn = async (instant: string) => {
  const manager = await as("manager", instant);
  const home = await manager.client.home.get();
  return home.queue.givingLess;
};

/** The morning after the ninth. */
const NEXT_MORNING = "2064-02-10T00:00:00.000Z";

describe("a cow giving less", () => {
  it("is named when her last two days fall a fifth under her week", async () => {
    const cow = await aCowInMilk(`কম পেন ক ${suffix}`);
    await milkNineDays(cow, (day) => (day >= 8 ? 6 : 10));
    const listed = await givingLessOn(NEXT_MORNING);
    expect(listed.find((one) => one.tag === cow.tag)).toMatchObject({
      lately: 6,
      usually: 10,
      dropPercent: 40,
    });
  });

  it("is not named giving what she usually does", async () => {
    const cow = await aCowInMilk(`কম পেন খ ${suffix}`);
    await milkNineDays(cow, () => 10);
    const listed = await givingLessOn(NEXT_MORNING);
    expect(listed.map((one) => one.tag)).not.toContain(cow.tag);
  });

  it("reads her whole oldest day, its morning milking too", async () => {
    // Four litres on the 1st, ten on the 2nd to the 7th, eight on the 8th and 9th. Her week is the 1st to the 7th: 64
    // litres over seven mornings, 9.14 a morning, and eight is 12% under it — not a fifth. Leave the 1st's morning out
    // and her week is ten, and eight reads as a fifth under.
    const cow = await aCowInMilk(`কম পেন ঘ ${suffix}`);
    await milkNineDays(cow, (day) => {
      if (day === 1) {
        return 4;
      }
      return day >= 8 ? 8 : 10;
    });
    const listed = await givingLessOn(NEXT_MORNING);
    expect(listed.map((one) => one.tag)).not.toContain(cow.tag);
  });

  it("counts milk thrown away under a Withdrawal as what she gave", async () => {
    const cow = await aCowInMilk(`কম পেন গ ${suffix}`);
    await milkNineDays(cow, (day) => (day >= 8 ? 6 : 10));
    const her = await scratchDb().query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber: cow.tag },
      columns: { id: true },
    });
    const hers = await scratchDb().query.milkRecord.findMany({
      where: { animalId: her?.id ?? "" },
      columns: { id: true },
    });
    await scratchDb()
      .update(milkRecord)
      .set({ destination: "discard" })
      .where(
        inArray(
          milkRecord.id,
          hers.map((one) => one.id)
        )
      );
    const listed = await givingLessOn(NEXT_MORNING);
    expect(listed.find((one) => one.tag === cow.tag)).toMatchObject({
      dropPercent: 40,
    });
  });

  it("is on the Milk page for the Manager, and not for Barn Staff", async () => {
    const manager = await as("manager", NEXT_MORNING);
    await expect(manager.client.milk.givingLess()).resolves.toBeInstanceOf(
      Array
    );
    const staff = await as("staff", NEXT_MORNING);
    await expect(staff.client.milk.givingLess()).rejects.toThrow();
  });
});

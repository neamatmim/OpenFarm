import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Deaths among grown animals: how many died, of what, and deaths for every hundred head kept a year, by Side — culls
// apart. And the death linked to the Vet's Diagnosis of it, which is hers alone.

const suffix = `deaths-${Date.now()}`;

const as = (role: "owner" | "manager" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let penId = "";
const cows: string[] = [];

beforeAll(async () => {
  const owner = await as("owner", "2080-01-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `গাভী পেন ${suffix}`,
  });
  penId = pen.id;
  for (const alias of ["ক", "খ", "গ", "ঘ"]) {
    // oxlint-disable-next-line no-await-in-loop -- one cow after another onto the register
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId,
      source: "born",
      aliases: [`${alias} ${suffix}`],
    });
    cows.push(cow.tagNumber);
  }
});

const die = async (
  tagNumber: string,
  kind: "died" | "culled",
  cause: string,
  instant: string,
  diagnosisId?: string
) => {
  const manager = await as("manager", instant);
  return await manager.client.animals.recordMortality({
    tagNumber,
    kind,
    cause,
    disposal: "buried",
    ...(diagnosisId ? { diagnosisId } : {}),
  });
};

const diagnose = async (tagNumber: string, instant: string) => {
  const vet = await as("vet", instant);
  return await vet.client.diagnoses.record({
    animalTag: tagNumber,
    disease: { bn: `দুধ জ্বর ${suffix}` },
  });
};

const deathOf = async (tagNumber: string) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber },
    columns: { id: true },
    with: { mortality: { columns: { diagnosisId: true } } },
  });
  return her?.mortality ?? null;
};

describe("deaths among grown animals", () => {
  it("refuses a Diagnosis that is not hers", async () => {
    const [, other = "", dying = ""] = cows;
    const elsewhere = await diagnose(other, "2080-06-30T06:00:00.000Z");
    await expect(
      die(dying, "died", "দুধ জ্বর", "2080-07-01T06:00:00.000Z", elsewhere.id)
    ).rejects.toMatchObject({ data: { refusal: "diagnosis_not_hers" } });
  });

  it("links her death to her own Diagnosis, and a Correction may link it later", async () => {
    const dying = cows[2] ?? "";
    const culled = cows[3] ?? "";
    const hers = await diagnose(dying, "2080-06-30T07:00:00.000Z");
    await die(dying, "died", "দুধ জ্বর", "2080-07-01T06:00:00.000Z", hers.id);
    expect(await deathOf(dying)).toEqual({ diagnosisId: hers.id });
    // Culled with her Vet's conclusion not yet to hand at the gate; the farm links it afterwards by a Correction.
    const later = await diagnose(culled, "2080-02-28T08:00:00.000Z");
    await die(culled, "culled", "বাঁজা", "2080-03-01T06:00:00.000Z");
    const manager = await as("manager", "2080-03-01T09:00:00.000Z");
    await manager.client.animals.correctMortality({
      tagNumber: culled,
      changes: { diagnosisId: { from: null, to: later.id } },
      reason: `ভেটের সিদ্ধান্ত পরে এসেছে ${suffix}`,
    });
    expect(await deathOf(culled)).toEqual({ diagnosisId: later.id });
  });

  it("counts the year's deaths by Side and by cause, culls apart, as a rate a hundred head a year", async () => {
    const owner = await as("owner", "2081-01-01T04:00:00.000Z");
    const deaths = await owner.client.herd.deaths();
    expect(deaths.dairy).toMatchObject({ died: 1, culled: 1 });
    // Two cows the whole year, one to July and one to March: about 2.7 head-years, one death.
    expect(deaths.dairy.headYears).toBeCloseTo(2.7, 1);
    expect(deaths.dairy.perHundred).toBeCloseTo(37.3, 0);
    expect(deaths.causes).toEqual([{ cause: "দুধ জ্বর", count: 1 }]);
  });
});

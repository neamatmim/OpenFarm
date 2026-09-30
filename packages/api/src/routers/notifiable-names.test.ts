import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A notifiable disease is known by the names a Vet writes it by, not only by the one on the list: "FMD" on a
// Diagnosis owes the office the same letter as "ক্ষুরা রোগ".

const suffix = `notifiable-names-${Date.now()}`;
const NOW = "2075-02-10T04:00:00.000Z";

const as = (role: "owner" | "manager" | "vet" | "staff") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(NOW) });

let penId = "";
let fmdId = "";

beforeAll(async () => {
  const owner = await as("owner");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `রোগ পেন ${suffix}`,
  });
  penId = pen.id;
  const manager = await as("manager");
  const fmd = await manager.client.notifiable.add({
    name: { bn: "ক্ষুরা রোগ", en: "Foot-and-mouth disease" },
    otherNames: ["FMD", "খুরা রোগ"],
  });
  fmdId = fmd.id;
});

const diagnosed = async (disease: { bn: string; en?: string }) => {
  const owner = await as("owner");
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId,
    source: "born",
    aliases: [],
  });
  const vet = await as("vet");
  return await vet.client.diagnoses.record({
    animalTag: cow.tagNumber,
    disease,
  });
};

/** Whether a Diagnosis in these words is one the farm must report. */
const isReported = async (disease: { bn: string; en?: string }) => {
  const made = await diagnosed(disease);
  return made.notifiable;
};

describe("a notifiable disease by another name", () => {
  it("is reported whether the Vet writes its name, its English spelt otherwise, or another name it goes by", async () => {
    expect(await isReported({ bn: "ক্ষুরা রোগ" })).toBe(true);
    expect(await isReported({ bn: "fmd" })).toBe(true);
    expect(await isReported({ bn: "খুরা রোগ" })).toBe(true);
    expect(
      await isReported({ bn: "পা ফোলা", en: "Foot and mouth disease" })
    ).toBe(true);
  });

  it("is not reported for a disease the list does not know", async () => {
    expect(await isReported({ bn: "ওলান প্রদাহ" })).toBe(false);
  });

  it("learns a new other name from whoever keeps the list, and is reported by it from then", async () => {
    expect(await isReported({ bn: "খুরা" })).toBe(false);
    const vet = await as("vet");
    await vet.client.notifiable.setOtherNames({
      id: fmdId,
      otherNames: ["FMD", "খুরা রোগ", "খুরা"],
    });
    expect(await isReported({ bn: "খুরা" })).toBe(true);
    const row = await scratchDb().query.notifiableDisease.findFirst({
      where: { id: fmdId },
      columns: { otherNames: true },
    });
    expect(row?.otherNames).toEqual(["FMD", "খুরা রোগ", "খুরা"]);
  });

  it("is reported when a Correction renames the Diagnosis to another name of it", async () => {
    const made = await diagnosed({ bn: "মুখে ঘা" });
    expect(made.notifiable).toBe(false);
    const vet = await as("vet");
    await vet.client.diagnoses.correct({
      id: made.id,
      changes: { disease: { from: "মুখে ঘা", to: { bn: "FMD" } } },
      reason: `খুরেও ঘা পাওয়া গেছে ${suffix}`,
    });
    const report = await scratchDb().query.dlsReport.findFirst({
      where: { diagnosisId: made.id, withdrawnAt: { isNull: true } },
      columns: { id: true },
    });
    expect(report).toBeDefined();
  });

  it("has its other names kept by the Owner, the Manager or the Vet, never Barn Staff", async () => {
    const staff = await as("staff");
    await expect(
      staff.client.notifiable.setOtherNames({ id: fmdId, otherNames: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

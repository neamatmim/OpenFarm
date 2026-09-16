import { eq, inArray } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

// The vaccination register (R3): every dose of a product the Vet has marked a vaccine, with the Lot Number it
// came from — the Campaign's, asked once for the Pen, or the animal's own — and who gave it.

const suffix = `${Date.now()}`;
const REGISTRATION = "DLS/SAV/2026/০৪২";
const MAY = { from: "2045-05-01", to: "2045-05-31" };

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** A campaign over the Pen: the lot asked once, then each animal dosed, with room for a lot of her own. */
const campaignSop = (
  name: string,
  productId: string,
  withLot: boolean
): SopContent => ({
  name: { bn: `${name} ${suffix}` },
  purpose: { bn: "পেনের সব পশুকে দিন" },
  triggers: [],
  appliesTo: { side: "dairy" },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 240,
  steps: [
    ...(withLot
      ? [
          {
            id: "lot",
            text: { bn: "ভায়ালের লট নম্বর লিখুন" },
            repeatPerAnimal: false,
            evidence: [{ type: "note" as const, required: true }],
            skipReasons: [],
            effect: { kind: "lot_number" as const },
          },
        ]
      : []),
    {
      id: "dose",
      text: { bn: "ডোজ দিন" },
      repeatPerAnimal: true,
      evidence: [
        { type: "tick", required: true },
        { type: "note", required: false },
      ],
      skipReasons: [{ bn: "অসুস্থ" }],
      effect: { kind: "treatment", productId },
    },
  ],
});

const setup = async () => {
  const start = "2045-04-20T04:00:00.000Z";
  const owner = await as("owner", start);
  const manager = await as("manager", start);
  const vet = await as("vet", start);
  const identity = await manager.client.farm.identity();
  if (identity.registrationMissing) {
    await manager.client.farm.setIdentity({ registrationNumber: REGISTRATION });
  }
  const shed = await owner.client.herd.createShed({ name: `reg3-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `টিকা ${suffix}`,
  });
  const fmd = await vet.client.drugs.add({
    name: { bn: `এফএমডি টিকা ${suffix}`, en: "FMD vaccine" },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 0,
  });
  const wormer = await vet.client.drugs.add({
    name: { bn: `লেভামিসোল ${suffix}`, en: "Levamisole" },
    milkWithdrawalDays: 3,
    meatWithdrawalDays: 7,
  });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-reg3-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const cow = () =>
    owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
  const cows = [await cow(), await cow(), await cow()] as const;
  return { owner, vet, pen, fmd, wormer, cows };
};

let world: Awaited<ReturnType<typeof setup>>;
const sops: string[] = [];

/** Raises a campaign over the Pen and hands back its Instance, claimed by Barn Staff. */
const raiseCampaign = async (definitionId: string, instant: string) => {
  const manager = await as("manager", instant);
  await manager.client.instances.raiseNow({
    definitionId,
    penId: world.pen.id,
  });
  const listed = await manager.client.instances.today({ penId: world.pen.id });
  const id = listed.find((row) => row.definitionId === definitionId)?.id ?? "";
  const staff = await as("staff", instant);
  await staff.client.instances.claim({ id });
  return { id, staff, manager };
};

const ours = (tag: string) => world.cows.some((cow) => cow.tagNumber === tag);

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const db = scratchDb();
  if (sops.length > 0) {
    await db
      .update(sopDefinition)
      .set({ retiredAt: new Date() })
      .where(inArray(sopDefinition.id, sops));
  }
  await db
    .delete(penAssignment)
    .where(eq(penAssignment.id, `pa-reg3-${world.pen.id}`));
});

describe("the vaccination register", () => {
  it("is the Vet's to say which products are vaccines", async () => {
    const manager = await as("manager", "2045-04-21T04:00:00.000Z");
    await expect(
      manager.client.drugs.markVaccine({ id: world.fmd.id, vaccine: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await world.vet.client.drugs.markVaccine({
      id: world.fmd.id,
      vaccine: true,
    });
    const list = await world.vet.client.drugs.list();
    expect(
      list
        .filter((row) => row.id === world.fmd.id || row.id === world.wormer.id)
        .map((row) => [row.id, row.vaccine])
    ).toEqual(
      expect.arrayContaining([
        [world.fmd.id, true],
        [world.wormer.id, false],
      ])
    );
  });

  it("asks for the Campaign's Lot Number once and gives it to every dose without one of its own, and a Correction puts it right", async () => {
    const vaccination = await world.owner.client.sops.create({
      content: campaignSop("এফএমডি টিকা", world.fmd.id, true),
    });
    const worming = await world.owner.client.sops.create({
      content: campaignSop("কৃমিনাশক", world.wormer.id, false),
    });
    sops.push(vaccination.definitionId, worming.definitionId);
    const [first, second, third] = world.cows;

    // 3 May: the FMD round. No lot yet, and she has none of her own: a vaccine dose nobody can trace is refused.
    const fmd = await raiseCampaign(
      vaccination.definitionId,
      "2045-05-03T04:00:00.000Z"
    );
    await expect(
      fmd.staff.client.instances.completeStep({
        instanceId: fmd.id,
        stepId: "dose",
        animalTag: first.tagNumber,
        evidence: [true, ""],
      })
    ).rejects.toMatchObject({ data: { refusal: "lot_number_missing" } });

    await fmd.staff.client.instances.completeStep({
      instanceId: fmd.id,
      stepId: "lot",
      evidence: ["FMD-2045-A"],
    });
    const dose = (cow: { tagNumber: string }, own: string) =>
      fmd.staff.client.instances.completeStep({
        instanceId: fmd.id,
        stepId: "dose",
        animalTag: cow.tagNumber,
        evidence: [true, own],
      });
    await dose(first, "");
    await dose(second, "FMD-2045-B");
    await dose(third, "");

    // The vaccinator misread the vial: the Campaign's Lot Number put right, and the third cow's dose was from another vial.
    const board = await fmd.manager.client.instances.get({ id: fmd.id });
    const completionOf = (stepId: string, animalId: string | null) =>
      board.completions.find(
        (row) => row.stepId === stepId && row.animalId === animalId
      )?.id ?? "";
    await correctStepAsShown(fmd.staff.client, {
      completionId: completionOf("lot", null),
      evidence: ["FMD-2045-A2"],
      reason: "ভায়ালের নম্বর ভুল পড়েছিলাম",
    });
    // Taken back altogether, the doses given from it would be untraceable: a Step done once is not skipped.
    await expect(
      correctStepAsShown(fmd.staff.client, {
        completionId: completionOf("lot", null),
        skipReason: "ভায়াল দেখা হয়নি",
        reason: "লট নম্বর লেখা হয়নি",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await correctStepAsShown(fmd.staff.client, {
      completionId: completionOf("dose", third.id),
      evidence: [true, "FMD-2045-C"],
      reason: "অন্য ভায়াল থেকে দেওয়া",
    });

    // 10 May: the first cow wormed. Not a vaccine, so not on the register.
    const worm = await raiseCampaign(
      worming.definitionId,
      "2045-05-10T04:00:00.000Z"
    );
    await worm.staff.client.instances.completeStep({
      instanceId: worm.id,
      stepId: "dose",
      animalTag: first.tagNumber,
      evidence: [true, ""],
    });

    const manager = await as("manager", "2045-06-01T04:00:00.000Z");
    const register = await manager.client.inspector.vaccinations(MAY);
    expect(register).toMatchObject(MAY);
    // A year to today unless asked, today counted: FMD and anthrax come round yearly.
    expect(await manager.client.inspector.vaccinations({})).toMatchObject({
      from: "2044-06-02",
      to: "2045-06-01",
    });
    expect(register.rows.filter((row) => ours(row.tagNumber))).toEqual([
      {
        id: expect.any(String),
        tagNumber: first.tagNumber,
        vaccine: `এফএমডি টিকা ${suffix}`,
        givenOn: "2045-05-03",
        lotNumber: "FMD-2045-A2",
        givenBy: expect.any(String),
      },
      {
        id: expect.any(String),
        tagNumber: second.tagNumber,
        vaccine: `এফএমডি টিকা ${suffix}`,
        givenOn: "2045-05-03",
        lotNumber: "FMD-2045-B",
        givenBy: expect.any(String),
      },
      {
        id: expect.any(String),
        tagNumber: third.tagNumber,
        vaccine: `এফএমডি টিকা ${suffix}`,
        givenOn: "2045-05-03",
        lotNumber: "FMD-2045-C",
        givenBy: expect.any(String),
      },
    ]);
  });

  it("prints the vaccination register and gives it as a CSV, each an Export", async () => {
    const manager = await as("manager", "2045-06-01T04:00:00.000Z");
    // A paper is in its producer's language, and other files choose the Manager's.
    await manager.client.language.set({ language: "bn" });
    const [first] = world.cows;
    const paper = await manager.client.inspector.print({
      report: "vaccination_register",
      ...MAY,
    });
    expect(paper.text).toContain("টিকার রেজিস্টার / Vaccination register");
    expect(paper.text).toContain(
      [
        `${first.tagNumber}`,
        `  টিকা / Vaccine: এফএমডি টিকা ${suffix}`,
        "  তারিখ / Date: ৩ মে, ২০৪৫",
        "  লট নম্বর / Lot number: FMD-2045-A2",
      ].join("\n")
    );

    const sheet = await manager.client.inspector.print({
      report: "vaccination_register",
      format: "csv",
      ...MAY,
    });
    const [header, ...rows] = (sheet.csv ?? "").slice(1).trim().split("\r\n");
    expect(header).toBe("tag,vaccine,date,lot_number,given_by");
    expect(rows.filter((row) => row.startsWith(`${first.tagNumber},`))).toEqual(
      [expect.stringMatching(/^[^,]+,[^,]+,2045-05-03,FMD-2045-A2,[^,]+$/u)]
    );

    const exports = await scratchDb().query.auditEvent.findMany({
      where: { entity: "report", action: "export" },
    });
    expect(
      exports
        .map((event) => event.after as Record<string, unknown> | null)
        .filter(
          (after) =>
            after?.report === "vaccination_register" && after.from === MAY.from
        )
        .map((after) => after?.format)
        .toSorted()
    ).toEqual(["csv", "paper"]);
  });

  it("will not publish a Lot Number step asked per animal, after the doses, or twice", async () => {
    const content = campaignSop("ভুল টিকা", world.fmd.id, true);
    const [lot, dose] = content.steps;
    const refused = (steps: SopContent["steps"]) =>
      expect(
        world.owner.client.sops.create({ content: { ...content, steps } })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    if (!(lot && dose)) {
      throw new Error("the campaign has a Lot Number step and a dose step");
    }
    await refused([{ ...lot, repeatPerAnimal: true }, dose]);
    await refused([dose, lot]);
    await refused([lot, { ...lot, id: "lot-again" }, dose]);
  });

  it("is the Owner's and the Manager's, never Barn Staff's", async () => {
    const staff = await as("staff", "2045-06-01T04:00:00.000Z");
    await expect(
      staff.client.inspector.vaccinations(MAY)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

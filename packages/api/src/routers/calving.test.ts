import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Calving: she calves, the record says when, how it went and what was born, and the farm does
// the rest — her next Lactation begins, and every calf becomes an animal of her own.

const suffix = `${Date.now()}`;

const choice = (values: string[], required: boolean) => ({
  type: "choice" as const,
  required,
  choices: values.map((value) => ({ value, label: { bn: value } })),
});

/** The calving pen, walked morning and evening: a cow who has calved is recorded, the rest skipped. */
const calvingRoundSop = (): SopContent => ({
  name: { bn: `বাচ্চা দেওয়ার ঘর দেখা ${suffix}`, en: "Calving pen round" },
  purpose: { bn: "বাচ্চা দেওয়া গাভী ও বাছুরের রেকর্ড রাখা" },
  triggers: [{ kind: "schedule", times: ["06:00", "18:00"] }],
  appliesTo: { side: "dairy" },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "calved",
      text: { bn: "বাচ্চা দিয়েছে কি?" },
      repeatPerAnimal: true,
      evidence: [
        { type: "datetime", required: true },
        choice(["unassisted", "assisted", "vet"], true),
        choice(["female", "male"], true),
        choice(["alive", "stillborn"], true),
        choice(["female", "male"], false),
        choice(["alive", "stillborn"], false),
        choice(["female", "male"], false),
        choice(["alive", "stillborn"], false),
      ],
      skipReasons: [{ bn: "এখনো বাচ্চা দেয়নি" }],
      effect: { kind: "calving" },
    },
  ],
});

const setup = async () => {
  const clock = new FakeClock("2032-03-01T00:00:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const shed = await owner.client.herd.createShed({ name: `cv-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `বাচ্চার ঘর ${suffix}`,
  });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-cv-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();
  const imported = await owner.client.animals.importRegister({
    csv: [
      "sex,side,state,pen,source,expected_calving",
      `female,dairy,dry,বাচ্চার ঘর ${suffix},bought,2032-03-12`,
      `female,dairy,dry,বাচ্চার ঘর ${suffix},bought,2032-03-20`,
      `female,dairy,dry,বাচ্চার ঘর ${suffix},bought,2032-03-25`,
    ].join("\n"),
  });
  const [single, stillborn, corrected] = imported.imported.map(
    (row) => row.tagNumber
  );
  const twinsMother = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "pregnant_heifer",
    penId: pen.id,
    source: "bought",
    aliases: [],
    expectedCalvingOn: "2032-03-15",
  });
  const heifer = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  const round = await owner.client.sops.create({ content: calvingRoundSop() });
  return {
    pen,
    single: single ?? "",
    stillborn: stillborn ?? "",
    corrected: corrected ?? "",
    twins: twinsMother.tagNumber,
    heifer: heifer.tagNumber,
    round,
  };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const { and, eq, inArray } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { sopInstance } = await import("@OpenFarm/db/schema/instance");
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.round.definitionId));
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.definitionId, world.round.definitionId),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
  await db
    .delete(penAssignment)
    .where(eq(penAssignment.id, `pa-cv-${world.pen.id}`));
});

/** The calving round of the morning `day`, raised and claimed, as `as` sees it. */
const morningRound = async (
  day: string,
  as: "staff" | "owner" | "manager" = "staff"
) => {
  const clock = new FakeClock(`${day}T01:00:00.000Z`);
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  await manager.client.instances.ensureDue();
  const today = await manager.client.instances.today({ penId: world.pen.id });
  const round = today.find(
    (row) =>
      row.definitionId === world.round.definitionId &&
      row.dueAt.toISOString() === `${day}T00:00:00.000Z`
  );
  const client = await createTestClient(appRouter, { as, clock });
  if (round?.state === "due") {
    await client.client.instances.claim({ id: round.id });
  }
  return { id: round?.id ?? "", client, manager };
};

describe("the calving", () => {
  it("starts her next Lactation and gives her calf the next dairy number", async () => {
    // Before six on 10 March — the farm's clock — the morning round finds her with a heifer calf.
    const { id, client, manager } = await morningRound("2032-03-10");
    const before = await manager.client.animals.byTag({
      tagNumber: world.single,
    });
    await client.client.instances.completeStep({
      instanceId: id,
      stepId: "calved",
      animalTag: world.single,
      evidence: [
        "2032-03-09T21:30:00.000Z",
        "unassisted",
        "female",
        "alive",
        "",
        "",
      ],
    });

    const later = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2032-03-20T06:00:00.000Z"),
    });
    const dam = await later.client.animals.byTag({ tagNumber: world.single });
    expect(dam.state).toBe("milking");
    expect(dam.lactationNumber).toBe(before.lactationNumber + 1);
    expect(dam.lactationStartedAt?.toISOString()).toBe(
      "2032-03-09T21:30:00.000Z"
    );
    // Ten days and a bit after she calved, worked out rather than typed.
    expect(dam.daysInMilk).toBe(10);
    // The calving she was expected to have is behind her.
    expect(dam.expectedCalvingAt).toBeNull();

    // One calving, one calf, read back from her side.
    expect(dam.calvings).toHaveLength(1);
    expect(dam.calvings[0]).toMatchObject({ ease: "unassisted" });
    const [calfTag] =
      dam.calvings[0]?.calves.map((calf) => calf.tagNumber) ?? [];
    expect(calfTag).toMatch(/^D-\d+$/u);
    expect(calfTag).not.toBe(world.single);

    // And from the calf's: a Calf of her own, in her mother's Pen, whose mother is named.
    const calf = await later.client.animals.byTag({ tagNumber: calfTag ?? "" });
    expect(calf).toMatchObject({
      state: "calf",
      sex: "female",
      side: "dairy",
      source: "born",
      penId: world.pen.id,
      officialTag: null,
    });
    expect(calf.birthDate?.toISOString()).toBe("2032-03-09T21:30:00.000Z");
    expect(calf.dam?.tagNumber).toBe(world.single);
  });

  it("records twins as one calving with two calves", async () => {
    const { id, client, manager } = await morningRound("2032-03-14");
    await client.client.instances.completeStep({
      instanceId: id,
      stepId: "calved",
      animalTag: world.twins,
      evidence: [
        "2032-03-13T23:00:00.000Z",
        "vet",
        "male",
        "alive",
        "female",
        "alive",
      ],
    });
    const dam = await manager.client.animals.byTag({ tagNumber: world.twins });
    // A heifer's first calving is her first Lactation.
    expect(dam.state).toBe("milking");
    expect(dam.lactationNumber).toBe(1);
    expect(dam.calvings).toHaveLength(1);
    expect(
      dam.calvings[0]?.calves.map((calf) => [calf.sex, calf.state])
    ).toEqual([
      ["male", "calf"],
      ["female", "calf"],
    ]);

    // The bull calf dies a week later. He was born alive, and his mother's calving still says so.
    const [bullCalf] = dam.calvings[0]?.calves ?? [];
    const weekOn = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2032-03-21T04:00:00.000Z"),
    });
    await weekOn.client.animals.recordMortality({
      tagNumber: bullCalf?.tagNumber ?? "",
      kind: "died",
      cause: "ডায়রিয়া",
      disposal: "buried",
    });
    const after = await weekOn.client.animals.byTag({ tagNumber: world.twins });
    expect(after.calvings[0]?.calves.map((calf) => calf.calfOutcome)).toEqual([
      "alive",
      "alive",
    ]);
  });

  it("creates a stillborn calf and lets it go as Died in the same act", async () => {
    const { id, client, manager } = await morningRound("2032-03-18");
    await client.client.instances.completeStep({
      instanceId: id,
      stepId: "calved",
      animalTag: world.stillborn,
      evidence: [
        "2032-03-18T00:30:00.000Z",
        "assisted",
        "male",
        "stillborn",
        "",
        "",
      ],
    });
    const dam = await manager.client.animals.byTag({
      tagNumber: world.stillborn,
    });
    // She calved all the same: her Lactation begins.
    expect(dam.state).toBe("milking");
    const [calf] = dam.calvings[0]?.calves ?? [];
    expect(calf).toMatchObject({ sex: "male", state: "died" });
    const record = await manager.client.animals.byTag({
      tagNumber: calf?.tagNumber ?? "",
    });
    expect(record.state).toBe("died");
    expect(record.dam?.tagNumber).toBe(world.stillborn);
    // On the mortality register like any other death, written under the Role the calving was recorded under.
    const death = await scratchDb().query.mortality.findFirst({
      where: { animalId: record.id },
      columns: { cause: true, disposal: true, recordedByRole: true },
    });
    expect(death).toEqual({
      cause: "stillbirth",
      disposal: null,
      recordedByRole: "staff",
    });
  });

  it("is not the Owner's to record, and not of a cow who is not in calf", async () => {
    const { id, client } = await morningRound("2032-03-19", "owner");
    await expect(
      client.client.instances.completeStep({
        instanceId: id,
        stepId: "calved",
        animalTag: world.corrected,
        evidence: [
          "2032-03-19T00:30:00.000Z",
          "unassisted",
          "female",
          "alive",
          "",
          "",
        ],
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { refusal: "staff_or_manager_only" },
    });

    // An open heifer walks the round with the rest, and nothing she does is a calving.
    const nextMorning = await morningRound("2032-03-20", "manager");
    await expect(
      nextMorning.client.client.instances.completeStep({
        instanceId: nextMorning.id,
        stepId: "calved",
        animalTag: world.heifer,
        evidence: [
          "2032-03-19T00:30:00.000Z",
          "unassisted",
          "female",
          "alive",
          "",
          "",
        ],
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "calving_of_a_cow_not_in_calf" },
    });
  });

  it("lets a calf written up alive be put right as stillborn, and asks before undoing a calving", async () => {
    const { id, client, manager } = await morningRound("2032-03-24");
    await client.client.instances.completeStep({
      instanceId: id,
      stepId: "calved",
      animalTag: world.corrected,
      evidence: [
        "2032-03-24T00:10:00.000Z",
        "unassisted",
        "female",
        "alive",
        "",
        "",
      ],
    });
    const board = await manager.client.instances.get({ id });
    const entry = board.completions.find(
      (row) => row.stepId === "calved" && row.status === "done"
    );
    await manager.client.instances.correctStep({
      completionId: entry?.id ?? "",
      evidence: [
        "2032-03-24T00:10:00.000Z",
        "unassisted",
        "female",
        "stillborn",
        "",
        "",
      ],
      reason: "বাছুর মৃত জন্মেছিল, ভুল লেখা হয়েছিল",
    });
    const dam = await manager.client.animals.byTag({
      tagNumber: world.corrected,
    });
    expect(dam.calvings[0]?.calves.map((calf) => calf.state)).toEqual(["died"]);

    // Taken back altogether, the calving cannot be undone from here: the calf has a number the farm
    // never reuses. She stays calved, and the Manager is asked.
    const undone = await manager.client.instances.correctStep({
      completionId: entry?.id ?? "",
      skipReason: "এখনো বাচ্চা দেয়নি",
      reason: "ভুল গাভী",
    });
    expect(undone.needsReview).toBe(true);
    const still = await manager.client.animals.byTag({
      tagNumber: world.corrected,
    });
    expect(still.state).toBe("milking");
    expect(still.calvings).toHaveLength(1);
  });
});

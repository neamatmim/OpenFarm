import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

/**
 * A bull sold on the quiet and written "died, buried" leaves no Sale and no alarm. A death or a cull is now taken only
 * with a photograph of the dead animal showing her tag, kept with the Mortality; a stillborn calf's is asked with her
 * disposal.
 */
const suffix = `death-photo-${Date.now()}`;
const AT = "2089-03-01T04:00:00.000Z";
const LATER_PHOTO = { contentType: "image/png", data: "bGF0ZXI=" } as const;

const as = (role: "owner" | "manager" | "staff" | "vet", instant = AT) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const choice = (values: string[], required: boolean) => ({
  type: "choice" as const,
  required,
  choices: values.map((value) => ({ value, label: { bn: value } })),
});

const calvingRoundSop = (): SopContent => ({
  name: { bn: `বাচ্চার ঘর ${suffix}` },
  purpose: { bn: "বাচ্চা দেওয়া গাভীর রেকর্ড" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
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

const tags = { bull: "", other: "", stillborn: "" };

beforeAll(async () => {
  const owner = await as("owner");
  await as("staff");
  await as("vet");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `পেন ${suffix}`,
    quarantine: true,
  });
  const bull = async () => {
    const registered = await owner.client.animals.register({
      sex: "male",
      side: "fattening",
      state: "quarantine",
      penId: pen.id,
      source: "bought",
      aliases: [],
    });
    return registered.tagNumber;
  };
  tags.bull = await bull();
  tags.other = await bull();
  const calving = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `বাচ্চার ঘর ${suffix}`,
  });
  const dam = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "pregnant_heifer",
    penId: calving.id,
    source: "bought",
    aliases: [],
    expectedCalvingOn: "2089-03-03",
  });
  const sop = await owner.client.sops.create({ content: calvingRoundSop() });
  // She calves a stillborn calf on the morning round: written on the round, with no photograph asked.
  const morning = "2089-03-02T01:00:00.000Z";
  const manager = await as("manager", morning);
  await manager.client.work.ensureDue();
  const listed = await manager.client.work.today({ penId: calving.id });
  const round = listed.find((row) => row.definitionId === sop.definitionId);
  await manager.client.work.claim({ id: round?.id ?? "" });
  await manager.client.work.completeStep({
    instanceId: round?.id ?? "",
    stepId: "calved",
    animalTag: dam.tagNumber,
    evidence: [
      "2089-03-02T00:30:00.000Z",
      "assisted",
      "male",
      "stillborn",
      "",
      "",
      "",
      "",
    ],
  });
  const after = await manager.client.animals.get({
    tagNumber: dam.tagNumber,
  });
  tags.stillborn = after.calvings[0]?.calves[0]?.tagNumber ?? "";
});

describe("a death's photograph", () => {
  it("is required: a bull written died, buried, with none, is refused", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.animals.recordMortality({
        tagNumber: tags.bull,
        kind: "died",
        cause: `পেট ফাঁপা ${suffix}`,
        disposal: "buried",
      })
    ).rejects.toMatchObject({ data: { refusal: "death_needs_a_photo" } });
  });

  it("is kept with the death, and the Vet reads it", async () => {
    const manager = await as("manager");
    await manager.client.animals.recordMortality({
      tagNumber: tags.bull,
      kind: "died",
      cause: `পেট ফাঁপা ${suffix}`,
      disposal: "buried",
      photo: A_DEATH_PHOTO,
    });
    const vet = await as("vet");
    const photos = await vet.client.animals.deathPhotos({
      tagNumber: tags.bull,
    });
    expect(photos).toEqual([
      expect.objectContaining({ data: A_DEATH_PHOTO.data, replacedAt: null }),
    ]);
  });

  it("is added to by a Correction, and the first is never taken away", async () => {
    const manager = await as("manager", "2089-03-01T09:00:00.000Z");
    await manager.client.animals.correctMortality({
      tagNumber: tags.bull,
      reason: `পরিষ্কার ছবি ${suffix}`,
      changes: {},
      photo: LATER_PHOTO,
    });
    const photos = await manager.client.animals.deathPhotos({
      tagNumber: tags.bull,
    });
    expect(photos.map((one) => one.data)).toEqual([
      A_DEATH_PHOTO.data,
      LATER_PHOTO.data,
    ]);
    expect(photos[0]?.replacedAt).not.toBeNull();
    expect(photos[1]?.replacedAt).toBeNull();
  });

  it("is not asked of the Calving, but of the stillborn calf's disposal", async () => {
    const manager = await as("manager", "2089-03-02T05:00:00.000Z");
    // Her death is written already, by the Calving, with no photograph.
    const calf = await manager.client.animals.get({
      tagNumber: tags.stillborn,
    });
    expect(calf.state).toBe("died");
    await expect(
      manager.client.animals.recordDisposal({
        tagNumber: tags.stillborn,
        disposal: "buried",
      })
    ).rejects.toMatchObject({ data: { refusal: "death_needs_a_photo" } });
    await manager.client.animals.recordDisposal({
      tagNumber: tags.stillborn,
      disposal: "buried",
      photo: A_DEATH_PHOTO,
    });
    const photos = await manager.client.animals.deathPhotos({
      tagNumber: tags.stillborn,
    });
    expect(photos).toHaveLength(1);
  });
});

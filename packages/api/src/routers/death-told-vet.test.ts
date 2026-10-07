import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { PushMessage, PushTarget, PushTransport } from "../push";
import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

/**
 * A death or a cull written with no Diagnosis of hers tells the Vet at once — her tag, died or culled, the cause as the
 * farm wrote it — and never what she cost: a death nobody has looked at is the Vet's to look at.
 */
const suffix = `death-told-vet-${Date.now()}`;
const DAY = "2091-05-01";
/** Ten in the morning, farm time. */
const AWAKE = `${DAY}T04:00:00.000Z`;
const ENDPOINT = `https://fcm.googleapis.com/fcm/send/${suffix}`;

/** Everything the farm tried to push, and to whom. */
const sent: { target: PushTarget; message: PushMessage }[] = [];
const transport: PushTransport = {
  send: (target, message) => {
    sent.push({ target, message });
    return Promise.resolve({ delivered: true, gone: false });
  },
};

const as = (role: "owner" | "manager" | "vet", instant = AWAKE) =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(instant),
    push: transport,
  });

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

const tags = {
  undiagnosed: "",
  diagnosed: "",
  corrected: "",
  voided: "",
  stillborn: "",
};

const vetsOwn = (tag: string) =>
  sent.filter(
    (one) => one.target.endpoint === ENDPOINT && one.message.body.includes(tag)
  );

const toldOf = async (
  tag: string,
  kind: "mortality_undiagnosed" | "mortality_recorded",
  role: "owner" | "vet"
) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { tagNumber: tag, farmId: theFarm().id },
    columns: { id: true },
    with: { mortality: { columns: { id: true } } },
  });
  return await scratchDb().query.alert.findMany({
    where: {
      kind,
      entityId: her?.mortality?.id ?? "",
      userId: thePerson(role).id,
    },
    columns: { params: true },
  });
};

const died = async (tagNumber: string, diagnosisId?: string) => {
  const manager = await as("manager");
  await manager.client.animals.recordMortality({
    tagNumber,
    kind: "died",
    cause: `পেট ফাঁপা ${suffix}`,
    disposal: "buried",
    photo: A_DEATH_PHOTO,
    ...(diagnosisId ? { diagnosisId } : {}),
  });
};

let diagnosisId = "";

beforeAll(async () => {
  const owner = await as("owner", `${DAY}T01:00:00.000Z`);
  await as("manager", `${DAY}T01:00:00.000Z`);
  const vet = await as("vet", `${DAY}T01:00:00.000Z`);
  // The Vet's own phone is the one listening.
  await vet.client.push.subscribe({
    endpoint: ENDPOINT,
    p256dh: "test-p256dh-key",
    auth: "test-auth-key",
  });
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `কোয়ারেন্টিন ${suffix}`,
    quarantine: true,
  });
  for (const key of [
    "undiagnosed",
    "diagnosed",
    "corrected",
    "voided",
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one bull after another off the lorry
    const bought = await owner.client.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 80_000,
      weightKg: 250,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(`${DAY}T01:00:00.000Z`),
      targetWindowStart: "2091-07-01",
      targetWindowEnd: "2091-07-05",
    });
    tags[key] = bought.tagNumber;
  }
  const seen = await as("vet", `${DAY}T02:00:00.000Z`);
  const diagnosis = await seen.client.diagnoses.record({
    animalTag: tags.diagnosed,
    disease: { bn: `নিউমোনিয়া ${suffix}` },
  });
  diagnosisId = diagnosis.id;
  // A stillborn calf on the morning round: her Calving writes her death and tells nobody.
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
    expectedCalvingOn: "2091-05-02",
  });
  const sop = await owner.client.sops.create({ content: calvingRoundSop() });
  const manager = await as("manager", `${DAY}T01:30:00.000Z`);
  await manager.client.work.ensureDue();
  const listed = await manager.client.work.today({ penId: calving.id });
  const round = listed.find((row) => row.definitionId === sop.definitionId);
  await manager.client.work.claim({ id: round?.id ?? "" });
  await manager.client.work.completeStep({
    instanceId: round?.id ?? "",
    stepId: "calved",
    animalTag: dam.tagNumber,
    evidence: [
      `${DAY}T01:00:00.000Z`,
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

describe("a death told to the Vet", () => {
  it("is told at once when no Diagnosis was named — her tag and the cause, never what she cost", async () => {
    await died(tags.undiagnosed);
    const told = await toldOf(tags.undiagnosed, "mortality_undiagnosed", "vet");
    expect(told).toEqual([
      {
        params: {
          tag: tags.undiagnosed,
          kind: "died",
          cause: `পেট ফাঁপা ${suffix}`,
        },
      },
    ]);
    const pushed = vetsOwn(tags.undiagnosed);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.message.body).not.toContain("৳");
    expect(pushed[0]?.message.url).toBe(`/animals/${tags.undiagnosed}`);
  });

  it("is not told where her Diagnosis was named; the Owner still is", async () => {
    await died(tags.diagnosed, diagnosisId);
    expect(
      await toldOf(tags.diagnosed, "mortality_undiagnosed", "vet")
    ).toEqual([]);
    expect(
      await toldOf(tags.diagnosed, "mortality_recorded", "owner")
    ).toHaveLength(1);
  });

  it("tells nobody of a Correction", async () => {
    await died(tags.corrected);
    const manager = await as("manager", `${DAY}T05:00:00.000Z`);
    await manager.client.animals.correctMortality({
      tagNumber: tags.corrected,
      reason: `আসলে বিষক্রিয়া ${suffix}`,
      changes: {
        cause: { from: `পেট ফাঁপা ${suffix}`, to: `বিষক্রিয়া ${suffix}` },
      },
    });
    expect(
      await toldOf(tags.corrected, "mortality_undiagnosed", "vet")
    ).toHaveLength(1);
  });

  it("is taken down, with the Owner's, when the death is voided: the bull is standing in his Pen", async () => {
    await died(tags.voided);
    const her = await scratchDb().query.animal.findFirst({
      where: { tagNumber: tags.voided, farmId: theFarm().id },
      columns: { id: true },
      with: { mortality: { columns: { id: true } } },
    });
    const deathId = her?.mortality?.id ?? "";
    const pushedBefore = vetsOwn(tags.voided).length;
    expect(pushedBefore).toBeGreaterThan(0);
    const owner = await as("owner", `${DAY}T06:00:00.000Z`);
    await owner.client.animals.correctMortality({
      tagNumber: tags.voided,
      reason: `ভুল ট্যাগে লেখা ${suffix}`,
      changes: { voided: { from: false, to: true } },
    });

    // The Vet's pocket heard of the death, so it hears it was taken back; the notice in the app clears quietly.
    const pushed = vetsOwn(tags.voided);
    expect(pushed).toHaveLength(pushedBefore + 1);
    expect(pushed.at(-1)?.message.body).toContain("ফিরিয়ে নেওয়া হয়েছে");
    const takenBack = await scratchDb().query.alert.findMany({
      where: { kind: "taken_back", entityId: deathId },
      columns: { userId: true },
    });
    expect(takenBack.map((one) => one.userId)).toContain(thePerson("vet").id);
    // Only the pockets the death reached: never the Manager, whom it was not told to, though the kind's Roles take him in.
    expect(takenBack.map((one) => one.userId)).not.toContain(
      thePerson("manager").id
    );

    const still = await scratchDb().query.alert.findMany({
      where: {
        farmId: theFarm().id,
        entityId: deathId,
        kind: { in: ["mortality_recorded", "mortality_undiagnosed"] },
      },
      columns: { kind: true, dismissedAt: true },
    });
    expect(still.length).toBeGreaterThan(1);
    expect(still.filter((one) => one.dismissedAt === null)).toEqual([]);
  });

  it("is told of a stillborn calf at her disposal", async () => {
    expect(
      await toldOf(tags.stillborn, "mortality_undiagnosed", "vet")
    ).toEqual([]);
    const manager = await as("manager", `${DAY}T06:00:00.000Z`);
    await manager.client.animals.recordDisposal({
      tagNumber: tags.stillborn,
      disposal: "buried",
      photo: A_DEATH_PHOTO,
    });
    expect(
      await toldOf(tags.stillborn, "mortality_undiagnosed", "vet")
    ).toHaveLength(1);
  });
});

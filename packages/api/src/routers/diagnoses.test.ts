import type { SopContent } from "@OpenFarm/domain";
import { DAY, FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** The round that starts the health chain: somebody walks the pen and says what they saw. */
const healthWalkSop = (): SopContent => ({
  name: { bn: "স্বাস্থ্য পরিদর্শন", en: "Health walk" },
  purpose: { bn: "প্রতিটি পশু দেখে যা চোখে পড়ে তা লিখুন" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 180,
  steps: [
    {
      id: "look",
      text: { bn: "পশুটিকে দেখুন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: [
            { value: "well", label: { bn: "সুস্থ" } },
            { value: "lame", label: { bn: "খোঁড়াচ্ছে" } },
          ],
        },
      ],
      skipReasons: [{ bn: "পশু পাওয়া যায়নি" }],
      effect: { kind: "observation" },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({
    name: `diagnoses-${Date.now()}`,
  });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "রোগ পেন",
  });
  const sop = await owner.client.sops.create({ content: healthWalkSop() });
  return { pen, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** A cow, and the round that saw her limping — the Observation a Diagnosis answers. */
const aLameCow = async (clock: FakeClock) => {
  // Walked by the Owner rather than Staff only because this file's Pen is new and nobody is
  // assigned to it; who may record an Observation is observations.test.ts's business.
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: world.pen.id,
    source: "born",
    aliases: [],
  });
  await owner.client.instances.ensureDue();
  const today = await owner.client.instances.today({ penId: world.pen.id });
  const instance = today.find(
    (row) => row.definitionId === world.sop.definitionId
  );
  if (!instance) {
    throw new Error("expected the health walk");
  }
  await owner.client.instances.claim({ id: instance.id });
  await owner.client.instances.completeStep({
    instanceId: instance.id,
    stepId: "look",
    animalTag: cow.tagNumber,
    evidence: ["lame"],
  });
  const page = await owner.client.animals.byTag({ tagNumber: cow.tagNumber });
  const seen = page.observations.at(0);
  if (!seen) {
    throw new Error("expected the round to have seen her");
  }
  return { cow, seen };
};

describe("a Diagnosis, and the Vet who makes it", () => {
  it("records the Vet's conclusion as an answer to what the round saw", async () => {
    const clock = new FakeClock("2028-05-01T02:00:00.000Z");
    const { cow, seen } = await aLameCow(clock);
    const vet = await createTestClient(appRouter, { as: "vet", clock });

    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      answers: seen.id,
      disease: { bn: "পায়ের ক্ষুরে পচন", en: "Foot rot" },
      note: "বাম পিছনের পা, খুরের মাঝে পচন",
    });

    // The animal's page reads as one chain: what the round saw, and what the Vet made of it.
    const page = await vet.client.animals.byTag({ tagNumber: cow.tagNumber });
    const chain = page.observations.find((one) => one.id === seen.id);
    expect(chain?.diagnoses).toHaveLength(1);
    expect(chain?.diagnoses[0]).toMatchObject({
      id: made.id,
      disease: "পায়ের ক্ষুরে পচন",
      note: "বাম পিছনের পা, খুরের মাঝে পচন",
      // The act is legally the Vet's, so the record names them rather than the farm.
      diagnosedByName: "ডা. করিম",
    });
  });

  it("refuses everybody else, and says why rather than only no", async () => {
    const clock = new FakeClock("2028-05-02T02:00:00.000Z");
    const { cow, seen } = await aLameCow(clock);
    const conclusion = {
      animalTag: cow.tagNumber,
      answers: seen.id,
      disease: { bn: "পায়ের ক্ষুরে পচন" },
    };

    for (const role of ["owner", "manager", "staff"] as const) {
      const them = await createTestClient(appRouter, { as: role, clock });
      // Not "forbidden": a Manager reading that would go looking for a permission to
      // change, and there is none — the prescription is the Vet's act in law.
      await expect(them.client.diagnoses.record(conclusion)).rejects.toThrow(
        /Only the Vet records a Diagnosis/u
      );
    }

    // Nor from the shed phone with the Vet PIN-switched in: a clinical act signed on a
    // phone the whole farm shares is not signed by anybody.
    const shedPhone = await createTestClient(appRouter, {
      as: "vet",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-diagnoses", name: "রোগ শেড ফোন" },
    });
    await expect(shedPhone.client.diagnoses.record(conclusion)).rejects.toThrow(
      /your own phone/u
    );

    // And nothing was written by any of them.
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    const page = await vet.client.animals.byTag({ tagNumber: cow.tagNumber });
    expect(
      page.observations.find((one) => one.id === seen.id)?.diagnoses
    ).toEqual([]);
  });

  it("keeps the chain to one animal, and to what still stands", async () => {
    const clock = new FakeClock("2028-05-03T02:00:00.000Z");
    const lame = await aLameCow(clock);
    const another = await aLameCow(clock);
    const vet = await createTestClient(appRouter, { as: "vet", clock });

    // Another cow's Observation would put this conclusion in a history it was never about.
    await expect(
      vet.client.diagnoses.record({
        animalTag: lame.cow.tagNumber,
        answers: another.seen.id,
        disease: { bn: "ওলান প্রদাহ" },
      })
    ).rejects.toThrow(/not this animal/u);

    // A Diagnosis need answer nothing: the Vet came for one cow and found something on the
    // way out.
    const found = await vet.client.diagnoses.record({
      animalTag: lame.cow.tagNumber,
      disease: { bn: "ওলান প্রদাহ", en: "Mastitis" },
    });
    const page = await vet.client.animals.byTag({
      tagNumber: lame.cow.tagNumber,
    });
    expect(page.diagnoses.map((one) => one.id)).toContain(found.id);
    // It answers no Observation, so it does not appear under one.
    expect(
      page.observations.flatMap((one) => one.diagnoses).map((one) => one.id)
    ).not.toContain(found.id);
  });

  it("lets the Vet put their own conclusion right long afterwards, losing nothing", async () => {
    const clock = new FakeClock("2028-05-04T02:00:00.000Z");
    const { cow, seen } = await aLameCow(clock);
    const vet = await createTestClient(appRouter, { as: "vet", clock });

    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      answers: seen.id,
      disease: { bn: "পায়ের ক্ষুরে পচন" },
      note: "বাম পিছনের পা",
    });

    // Three months on — long past the thirty days a Manager would have had. An animal's
    // clinical history matters for as long as she is on the farm.
    const NINETY_DAYS = 90;
    clock.advance(NINETY_DAYS * DAY);
    // Signed in again, because nobody stays signed in for three months.
    const later = await createTestClient(appRouter, { as: "vet", clock });
    await later.client.diagnoses.correct({
      id: made.id,
      changes: {
        disease: {
          from: "পায়ের ক্ষুরে পচন",
          to: { bn: "ক্ষুর রোগ", en: "Foot and mouth" },
        },
        note: { from: "বাম পিছনের পা", to: "মুখেও ঘা, আগের সিদ্ধান্ত ভুল ছিল" },
      },
      reason: "মুখের ঘা পরে দেখা গেছে",
    });

    const page = await later.client.animals.byTag({ tagNumber: cow.tagNumber });
    const standing = page.observations
      .find((one) => one.id === seen.id)
      ?.diagnoses.find((one) => one.id === made.id);
    expect(standing?.disease).toBe("ক্ষুর রোগ");

    // Nothing deleted: the trail holds what it said before, why it changed, and in order.
    const trail = await later.client.audit.list({
      entity: "diagnosis",
      entityId: made.id,
    });
    expect(trail.map((event) => event.action)).toEqual(["correct", "create"]);
    const [correction] = trail;
    expect(correction).toMatchObject({
      reason: "মুখের ঘা পরে দেখা গেছে",
      roleUsed: "vet",
      before: { disease: "পায়ের ক্ষুরে পচন" },
      after: { disease: "ক্ষুর রোগ" },
    });
  });

  it("shows the Vet what nobody has answered, and stops showing it once they have", async () => {
    const clock = new FakeClock("2028-05-05T02:00:00.000Z");
    const { cow, seen } = await aLameCow(clock);
    const vet = await createTestClient(appRouter, { as: "vet", clock });

    const before = await vet.client.diagnoses.waiting();
    expect(before.map((one) => one.id)).toContain(seen.id);
    expect(before.find((one) => one.id === seen.id)).toMatchObject({
      tagNumber: cow.tagNumber,
      saw: "lame",
    });

    await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      answers: seen.id,
      disease: { bn: "পায়ের ক্ষুরে পচন" },
    });

    const after = await vet.client.diagnoses.waiting();
    expect(after.map((one) => one.id)).not.toContain(seen.id);
    // And it is in their own work instead.
    const mine = await vet.client.diagnoses.mine();
    expect(mine.map((one) => one.tagNumber)).toContain(cow.tagNumber);
  });

  it("will not answer an Observation the farm has taken back", async () => {
    const clock = new FakeClock("2028-05-06T02:00:00.000Z");
    const { cow, seen } = await aLameCow(clock);
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });

    // The round looked at the wrong cow; the Observation is withdrawn and another stands in
    // its place.
    await owner.client.instances.correctStep({
      completionId: seen.completionId ?? "",
      evidence: ["well"],
      reason: "ভুল পশু দেখা হয়েছিল",
    });

    await expect(
      vet.client.diagnoses.record({
        animalTag: cow.tagNumber,
        answers: seen.id,
        disease: { bn: "পায়ের ক্ষুরে পচন" },
      })
    ).rejects.toThrow(/corrected/u);
  });
  it("is one Vet's own: another Vet may read it but not change it", async () => {
    const clock = new FakeClock("2028-05-07T02:00:00.000Z");
    const { cow, seen } = await aLameCow(clock);
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    const other = await createTestClient(appRouter, { as: "otherVet", clock });

    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      answers: seen.id,
      disease: { bn: "পায়ের ক্ষুরে পচন" },
    });

    // The other Vet sees it — the herd's health is every Vet's business —
    const page = await other.client.animals.byTag({ tagNumber: cow.tagNumber });
    expect(
      page.observations
        .find((one) => one.id === seen.id)
        ?.diagnoses.map((one) => one.id)
    ).toContain(made.id);
    // — but a conclusion somebody else signed is not theirs to rewrite.
    await expect(
      other.client.diagnoses.correct({
        id: made.id,
        changes: {
          disease: { from: "পায়ের ক্ষুরে পচন", to: { bn: "ক্ষুর রোগ" } },
        },
        reason: "আমার মনে হয় অন্য রোগ",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { refusal: { word: "not_theirs" } },
    });

    // And it is not in their own work either.
    const theirs = await other.client.diagnoses.mine();
    expect(theirs.map((one) => one.id)).not.toContain(made.id);
  });

  it("keeps the clinical record from Barn Staff, who see the round's own notes", async () => {
    const clock = new FakeClock("2028-05-08T02:00:00.000Z");
    const { cow, seen } = await aLameCow(clock);
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      answers: seen.id,
      disease: { bn: "পায়ের ক্ষুরে পচন" },
    });

    // Staff record what they see and give the doses they are told to give; the conclusions
    // drawn from them are not theirs to read (roles matrix).
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const page = await staff.client.animals.byTag({ tagNumber: cow.tagNumber });
    const theirView = page.observations.find((one) => one.id === seen.id);
    expect(theirView?.sawLabel).toBe("খোঁড়াচ্ছে");
    expect(theirView?.diagnoses).toEqual([]);
    expect(page.diagnoses).toEqual([]);
  });
});

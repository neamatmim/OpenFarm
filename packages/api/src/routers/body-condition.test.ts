import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { standardPlaybook } from "@OpenFarm/domain";
import {
  DAY,
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { aMonthOn } from "../test/carrying";
import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

/**
 * Body Condition is asked at every Weigh-in, at Dry-off and at Calving, and was read nowhere: a score somebody took the
 * trouble to judge, kept in the Step's answer and never shown again. Her page says her latest and the few before it,
 * and the Fattening board says each animal's latest beside what she weighs.
 */
const suffix = `body-condition-${Date.now()}`;

/** A standard procedure as the farm adopts it, falling due every morning so a test can walk it on the day it likes. */
const everyMorning = (content: SopContent, name: string): SopContent => ({
  ...content,
  name: { bn: `${content.name.bn} ${name}`, en: content.name.en },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
});

const setup = async () => {
  const clock = new FakeClock("2027-02-01T03:00:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  const shed = await owner.client.sheds.create({ name: suffix });
  const bullPen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ষাঁড় ${suffix}`,
  });
  const cowPen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `গাভী ${suffix}`,
  });
  const bull = await manager.client.intakes.record({
    penId: bullPen.id,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceMoney: 90_000,
    weightKg: 200,
    estimatedAgeMonths: 22,
  });
  // Never judged: weighed, and nobody had the eye for her.
  const unjudged = await manager.client.intakes.record({
    penId: bullPen.id,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceMoney: 90_000,
    weightKg: 210,
    estimatedAgeMonths: 22,
  });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: cowPen.id,
    source: "born",
    aliases: [],
  });
  await owner.client.animals.setState({
    tagNumber: cow.tagNumber,
    state: "pregnant_heifer",
    expectedCalvingOn: aMonthOn(owner),
  });
  await owner.client.animals.setState({
    tagNumber: cow.tagNumber,
    state: "milking",
    calvedAt: new Date(clock.now().getTime() - 300 * DAY),
  });

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values(
      [bullPen, cowPen].map((pen) => ({
        id: `pa-${suffix}-${pen.id}`,
        farmId: theFarm().id,
        userId: thePerson("staff").id,
        penId: pen.id,
      }))
    )
    .onConflictDoNothing();

  const playbook = standardPlaybook();
  const weighIn = await owner.client.sops.create({
    content: everyMorning(
      { ...playbook.weighIn, appliesTo: { side: "fattening" } },
      suffix
    ),
  });
  const dryOff = await owner.client.sops.create({
    content: everyMorning(playbook.dryOff, suffix),
  });
  return {
    bullPen,
    cowPen,
    bull: bull.tagNumber,
    unjudged: unjudged.tagNumber,
    cow: cow.tagNumber,
    weighIn,
    dryOff,
  };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** A procedure's work in a Pen on its own morning, claimed by the Staff member who walks it. */
const round = async (day: string, definitionId: string, penId: string) => {
  const clock = new FakeClock(`${day}T07:30:00.000Z`);
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  await owner.client.work.ensureDue();
  const today = await owner.client.work.today({ penId });
  const instance = today.find((one) => one.definitionId === definitionId);
  if (!instance) {
    throw new Error(`expected the work in its Pen on ${day}`);
  }
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  await staff.client.work.claim({ id: instance.id });
  return { instance, staff, owner };
};

describe("Body Condition", () => {
  it("is read on her page, the latest first, and on the Fattening board beside what she weighs", async () => {
    const first = await round(
      "2027-02-02",
      world.weighIn.definitionId,
      world.bullPen.id
    );
    await first.staff.client.work.completeStep({
      instanceId: first.instance.id,
      stepId: "weigh",
      animalTag: world.bull,
      evidence: [214, "2"],
    });
    await first.staff.client.work.completeStep({
      instanceId: first.instance.id,
      stepId: "weigh",
      animalTag: world.unjudged,
      evidence: [215],
    });

    const second = await round(
      "2027-02-16",
      world.weighIn.definitionId,
      world.bullPen.id
    );
    await second.staff.client.work.completeStep({
      instanceId: second.instance.id,
      stepId: "weigh",
      animalTag: world.bull,
      evidence: [230, "3"],
    });
    await second.staff.client.work.completeStep({
      instanceId: second.instance.id,
      stepId: "weigh",
      animalTag: world.unjudged,
      evidence: [231, ""],
    });

    // A third round he would not go up the crush: skipped, he was not judged, and his last score stands.
    const third = await round(
      "2027-03-02",
      world.weighIn.definitionId,
      world.bullPen.id
    );
    await third.staff.client.work.completeStep({
      instanceId: third.instance.id,
      stepId: "weigh",
      animalTag: world.bull,
      skipReason: "ক্রাশে ওঠেনি",
    });

    const his = await third.owner.client.animals.get({ tagNumber: world.bull });
    expect(his.bodyCondition).toMatchObject([
      {
        score: 3,
        judgedAt: new Date("2027-02-16T07:30:00.000Z"),
        procedure: { en: "Weigh-in" },
      },
      { score: 2, judgedAt: new Date("2027-02-02T07:30:00.000Z") },
    ]);
    const never = await third.owner.client.animals.get({
      tagNumber: world.unjudged,
    });
    expect(never.bodyCondition).toEqual([]);

    const board = await third.owner.client.fattening.list();
    expect(board.find((row) => row.tagNumber === world.bull)).toMatchObject({
      bodyCondition: {
        score: 3,
        judgedAt: new Date("2027-02-16T07:30:00.000Z"),
      },
    });
    expect(
      board.find((row) => row.tagNumber === world.unjudged)?.bodyCondition
    ).toBeNull();

    // Put right, the score his page reads is the one the Step holds now.
    const walked = await second.staff.client.work.get({
      id: second.instance.id,
    });
    const judged = walked.completions.find((one) => one.animalId === his.id);
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2027-03-02T09:00:00.000Z"),
    });
    await correctStepAsShown(manager.client, {
      completionId: judged?.id ?? "",
      evidence: [230, "4"],
      reason: "আবার দেখে",
    });
    const putRight = await manager.client.animals.get({
      tagNumber: world.bull,
    });
    expect(putRight.bodyCondition[0]).toMatchObject({ score: 4 });
  });

  it("is asked as she goes dry, and read on her page", async () => {
    const { instance, staff, owner } = await round(
      "2027-03-03",
      world.dryOff.definitionId,
      world.cowPen.id
    );
    await staff.client.work.completeStep({
      instanceId: instance.id,
      stepId: "dry",
      animalTag: world.cow,
      evidence: [true, "2"],
    });
    const her = await owner.client.animals.get({ tagNumber: world.cow });
    expect(her.state).toBe("dry");
    expect(her.bodyCondition).toMatchObject([
      { score: 2, procedure: { en: "Dry-off" } },
    ]);
  });
});

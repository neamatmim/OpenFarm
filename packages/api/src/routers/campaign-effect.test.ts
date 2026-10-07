import { eq } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { WRITTEN_BY_MISTAKE } from "@OpenFarm/domain";
import {
  DAY,
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

/**
 * A deworming campaign: one piece of work for the Pen, with a Step done animal by animal, so
 * every cow ends up with the event in her own history.
 */
const campaignSop = (productId: string): SopContent => ({
  name: { bn: "কৃমিনাশক অভিযান", en: "Deworming campaign" },
  purpose: { bn: "পেনের প্রতিটি পশুকে কৃমিনাশক খাওয়ান" },
  // Nothing raises it: a deworming happens when the farm decides, not every morning.
  triggers: [],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 240,
  steps: [
    {
      id: "dose",
      text: { bn: "ওষুধ খাওয়ান" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "পশু পাওয়া যায়নি" }, { bn: "গর্ভবতী" }],
      /** The Version names what is being given: the record is the farm's, not the milker's. */
      effect: { kind: "treatment", productId },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const vet = await createTestClient(appRouter, { as: "vet" });
  const shed = await owner.client.sheds.create({
    name: `campaigns-${Date.now()}`,
  });
  const wormer = await vet.client.drugs.create({
    name: { bn: `আলবেন্ডাজল ${Date.now()}`, en: "Albendazole" },
    milkWithdrawalDays: 3,
    meatWithdrawalDays: 14,
  });
  const sop = await owner.client.sops.create({
    content: campaignSop(wormer.id),
  });
  await createTestClient(appRouter, { as: "staff" });
  return { shedId: shed.id, sop, wormer };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/**
 * A Pen of her own for each campaign, and the Staff member who walks it.
 *
 * Per test, because a campaign covers every animal standing in the Pen and cannot be completed
 * until each of them is accounted for — cows left behind by an earlier test would make the next
 * one impossible.
 */
const aPenOfCows = async (clock: FakeClock, count: number) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const pen = await owner.client.sheds.pens.create({
    shedId: world.shedId,
    name: `অভিযান ${Date.now()}`,
  });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-campaigns-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const cows = [];
  for (let i = 0; i < count; i += 1) {
    // Sequential: tag numbers are handed out in order, and the farm has one counter.
    // oxlint-disable-next-line no-await-in-loop
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    cows.push(cow);
  }
  return { pen, cows };
};

/** Hands the farm back as it was found: a campaign left standing raises work in every Pen on
 *  the farm, including those of files that run after this one. */
afterAll(async () => {
  await scratchDb()
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.sop.definitionId));
});

describe("a campaign over a Pen", () => {
  it("leaves the event in every animal's own history", async () => {
    const clock = new FakeClock("2026-11-01T03:30:00.000Z");
    const { pen, cows } = await aPenOfCows(clock, 2);
    const [first, second] = cows;
    if (!(first && second)) {
      throw new Error("expected two cows");
    }
    const staff = await createTestClient(appRouter, { as: "staff", clock });

    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await manager.client.work.raiseNow({
      definitionId: world.sop.definitionId,
      penId: pen.id,
    });
    const today = await staff.client.work.today({ penId: pen.id });
    const campaign = today.find(
      (row) => row.definitionId === world.sop.definitionId
    );
    if (!campaign) {
      throw new Error("expected the campaign on the day's work");
    }
    await staff.client.work.claim({ id: campaign.id });

    // One cow gets it; the other is not in the pen when they come round.
    await staff.client.work.completeStep({
      instanceId: campaign.id,
      stepId: "dose",
      animalTag: first.tagNumber,
      evidence: [true],
    });
    await staff.client.work.completeStep({
      instanceId: campaign.id,
      stepId: "dose",
      animalTag: second.tagNumber,
      evidence: [],
      skipReason: "পশু পাওয়া যায়নি",
    });

    // Finished, because a campaign with an animal accounted for either way is finished — and
    // work left open on an early date is work every later test finds at the top of its
    // overdue list.
    await staff.client.work.complete({ id: campaign.id });

    // Per animal, not per campaign: the treated cow carries the event and the hold it earns.
    const treated = await staff.client.animals.get({
      tagNumber: first.tagNumber,
    });
    expect(treated.treatments).toHaveLength(1);
    expect(treated.treatments.at(0)).toMatchObject({
      productNameEn: "Albendazole",
      givenByName: "রহিম",
    });
    expect(treated.milkWithdrawalUntil).toEqual(
      new Date(clock.now().getTime() + 3 * DAY)
    );

    // And the one nobody could find carries why, with nothing held against her.
    const skipped = await staff.client.animals.get({
      tagNumber: second.tagNumber,
    });
    expect(skipped.treatments).toEqual([]);
    expect(skipped.milkWithdrawalUntil).toBeNull();
  });
  it("carries the reason an animal was skipped, and still finishes", async () => {
    const clock = new FakeClock("2026-11-02T03:30:00.000Z");
    const { pen, cows } = await aPenOfCows(clock, 2);
    const [treated, missed] = cows;
    if (!(treated && missed)) {
      throw new Error("expected two cows");
    }
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    await manager.client.work.raiseNow({
      definitionId: world.sop.definitionId,
      penId: pen.id,
    });
    const today = await staff.client.work.today({ penId: pen.id });
    const campaign = today.find(
      (row) => row.definitionId === world.sop.definitionId
    );
    if (!campaign) {
      throw new Error("expected the campaign on the day's work");
    }
    await staff.client.work.claim({ id: campaign.id });
    await staff.client.work.completeStep({
      instanceId: campaign.id,
      stepId: "dose",
      animalTag: treated.tagNumber,
      evidence: [true],
    });
    await staff.client.work.completeStep({
      instanceId: campaign.id,
      stepId: "dose",
      animalTag: missed.tagNumber,
      evidence: [],
      skipReason: "গর্ভবতী",
    });

    // A campaign finishes with an animal skipped: what the round could not do is part of the
    // record, not a reason to leave the work open for ever.
    await staff.client.work.complete({ id: campaign.id });
    const board = await manager.client.work.get({ id: campaign.id });
    expect(board.state).toBe("completed");
    const hers = board.completions.find(
      (row) => row.animalId === missed.id && row.stepId === "dose"
    );
    expect(hers).toMatchObject({ status: "skipped", skipReason: "গর্ভবতী" });
  });

  it("takes back a dose tapped on the wrong cow as written by mistake, and nothing is said of her", async () => {
    const clock = new FakeClock("2026-11-03T03:30:00.000Z");
    const { pen, cows } = await aPenOfCows(clock, 1);
    const [cow] = cows;
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await manager.client.work.raiseNow({
      definitionId: world.sop.definitionId,
      penId: pen.id,
    });
    const today = await staff.client.work.today({ penId: pen.id });
    const campaign = today.find(
      (row) => row.definitionId === world.sop.definitionId
    );
    if (!(campaign && cow)) {
      throw new Error("expected the campaign on the day's work");
    }
    await staff.client.work.claim({ id: campaign.id });
    await staff.client.work.completeStep({
      instanceId: campaign.id,
      stepId: "dose",
      animalTag: cow.tagNumber,
      evidence: [true],
    });
    const board = await manager.client.work.get({ id: campaign.id });
    const completionId = board.completions[0]?.id ?? "";

    // A reason the Version never wrote is still refused for a skip; the farm's own word for a slip is not.
    await expect(
      correctStepAsShown(manager.client, {
        completionId,
        evidence: [],
        skipReason: "অন্য কিছু",
        reason: "ভুল গাভী",
      })
    ).rejects.toMatchObject({ data: { refusal: "skip_reason_not_offered" } });
    await correctStepAsShown(manager.client, {
      completionId,
      evidence: [],
      skipReason: WRITTEN_BY_MISTAKE.bn,
      reason: "ভুল গাভী",
    });

    const dose = await scratchDb().query.treatment.findFirst({
      where: { instanceId: campaign.id, animalId: cow.id },
      columns: { givenAt: true, milkWithdrawalDays: true },
    });
    expect(dose).toEqual({ givenAt: null, milkWithdrawalDays: null });
  });

  it("will not publish a campaign naming a product nobody may give", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const manager = await createTestClient(appRouter, { as: "manager" });

    // Bought this morning, days not read off the label yet: a campaign that gave it would be
    // milk nobody could call safe, and the refusal comes now rather than in the shed.
    const unread = await manager.client.drugs.create({
      name: { bn: `অজানা টিকা ${Date.now()}` },
    });
    await expect(
      owner.client.sops.create({ content: campaignSop(unread.id) })
    ).rejects.toThrow(/withdrawal/u);

    // And a product that is not on the list at all.
    await expect(
      owner.client.sops.create({ content: campaignSop("no-such-product") })
    ).rejects.toThrow(/drug list/iu);
  });
  it("is run when the Manager says, not every morning for ever", async () => {
    const clock = new FakeClock("2026-11-03T03:30:00.000Z");
    const { pen, cows } = await aPenOfCows(clock, 1);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const staff = await createTestClient(appRouter, { as: "staff", clock });

    // The Manager decides today is the day.
    const raised = await manager.client.work.raiseNow({
      definitionId: world.sop.definitionId,
      penId: pen.id,
    });
    expect(raised.raised).toBe(1);

    const today = await staff.client.work.today({ penId: pen.id });
    const mine = today.filter(
      (row) => row.definitionId === world.sop.definitionId
    );
    expect(mine.length).toBeGreaterThan(0);

    // Asked twice in one day by accident, the farm has one campaign to do, not two.
    await manager.client.work.raiseNow({
      definitionId: world.sop.definitionId,
      penId: pen.id,
    });
    const after = await staff.client.work.today({ penId: pen.id });
    expect(
      after.filter((row) => row.definitionId === world.sop.definitionId)
    ).toHaveLength(mine.length);

    // And Barn Staff do not decide when the farm runs a campaign.
    await expect(
      staff.client.work.raiseNow({
        definitionId: world.sop.definitionId,
        penId: pen.id,
      })
    ).rejects.toThrow();

    // Done and dusted, so the farm is handed back with nothing standing open.
    const [cow] = cows;
    if (!cow) {
      throw new Error("expected a cow");
    }
    const [work] = mine;
    if (!work) {
      throw new Error("expected the campaign");
    }
    await staff.client.work.claim({ id: work.id });
    await staff.client.work.completeStep({
      instanceId: work.id,
      stepId: "dose",
      animalTag: cow.tagNumber,
      evidence: [true],
    });
    await staff.client.work.complete({ id: work.id });
  });
});

describe("a dose the Vet recorded", () => {
  it("is the Vet's to put right later, as their own health entry", async () => {
    const clock = new FakeClock("2026-11-20T03:30:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    // A vaccination round the Vet walks themselves.
    const vetsRound = await owner.client.sops.create({
      content: {
        ...campaignSop(world.wormer.id),
        name: { bn: `ভেটের টিকা ${Date.now()}`, en: "The Vet's round" },
        assignedRole: "vet",
        checkerRole: null,
      },
    });
    try {
      const { pen, cows } = await aPenOfCows(clock, 1);
      const [cow] = cows;
      const manager = await createTestClient(appRouter, {
        as: "manager",
        clock,
      });
      await manager.client.work.raiseNow({
        definitionId: vetsRound.definitionId,
        penId: pen.id,
      });
      const vet = await createTestClient(appRouter, { as: "vet", clock });
      const today = await vet.client.work.today({ penId: pen.id });
      const raised = today.find(
        (row) => row.definitionId === vetsRound.definitionId
      );
      if (!raised) {
        throw new Error("expected the Vet's round on the day's work");
      }
      await vet.client.work.claim({ id: raised.id });
      await vet.client.work.completeStep({
        instanceId: raised.id,
        stepId: "dose",
        animalTag: cow?.tagNumber,
        evidence: [],
        skipReason: "গর্ভবতী",
      });
      const loaded = await vet.client.work.get({ id: raised.id });
      const completionId = loaded.completions[0]?.id ?? "";

      // Ten minutes on, the Vet sees she was not pregnant after all and gave it.
      clock.advance(10 * 60_000);
      const later = await createTestClient(appRouter, { as: "vet", clock });
      await expect(
        correctStepAsShown(later.client, {
          completionId,
          evidence: [true],
          reason: "গর্ভবতী নয়, দেওয়া হয়েছে",
        })
      ).resolves.toBeDefined();
    } finally {
      await scratchDb()
        .update(sopDefinition)
        .set({ retiredAt: new Date() })
        .where(eq(sopDefinition.id, vetsRound.definitionId));
    }
  });
});

import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The passport and the withdrawal summary: everything the farm knows about one animal, for
// whoever asks — a buyer before they buy, a slaughter vet afterwards.

const suffix = `${Date.now()}`;

const campaignSop = (productId: string): SopContent => ({
  name: { bn: `টিকা ${suffix}`, en: "Vaccination" },
  purpose: { bn: "পেনের সব পশুকে টিকা" },
  triggers: [],
  appliesTo: { side: "fattening" },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 240,
  steps: [
    {
      id: "dose",
      text: { bn: "টিকা দিন" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "অসুস্থ" }],
      effect: { kind: "treatment", productId },
    },
  ],
});

const setup = async () => {
  const clock = new FakeClock("2027-07-01T07:30:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  const vet = await createTestClient(appRouter, { as: "vet", clock });
  const shed = await owner.client.herd.createShed({ name: `pass-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `পেন ক ${suffix}`,
  });
  const second = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `পেন খ ${suffix}`,
  });

  const bull = async (penId: string) => {
    const taken = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `হাট ${suffix}`, address: "সাভার হাট" },
      purchasePriceBdt: 90_000,
      weightKg: 300,
      estimatedAgeMonths: 24,
      breed: "শাহীওয়াল",
      targetWeightKg: 280,
      targetWindowStart: "2027-08-17",
      targetWindowEnd: "2027-08-19",
    });
    await manager.client.animals.setState({
      tagNumber: taken.tagNumber,
      state: "fattening",
    });
    return taken;
  };
  const bulls = [await bull(pen.id), await bull(second.id)];

  const vaccine = await vet.client.drugs.add({
    name: { bn: `ক্ষুরারোগ টিকা ${suffix}`, en: "FMD vaccine" },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 21,
  });
  const campaign = await owner.client.sops.create({
    content: campaignSop(vaccine.id),
  });

  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values(
      [pen.id, second.id].map((penId) => ({
        id: `pa-pass-${penId}`,
        farmId: TEST_FARM.id,
        userId: "test-staff",
        penId,
      }))
    )
    .onConflictDoNothing();

  return { owner, manager, vet, pen, second, bulls, campaign, vaccine };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const { and, eq, inArray } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { sopInstance } = await import("@OpenFarm/db/schema/instance");
  const { penAssignment: assignment } =
    await import("@OpenFarm/db/schema/herd");
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.campaign.definitionId));
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.definitionId, world.campaign.definitionId),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
  await db
    .delete(assignment)
    .where(
      inArray(assignment.id, [
        `pa-pass-${world.pen.id}`,
        `pa-pass-${world.second.id}`,
      ])
    );
});

const tagOf = (index: number) => world.bulls[index]?.tagNumber ?? "";
const asManager = (day: string) =>
  createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock(`${day}T09:00:00.000Z`),
  });

/** The vaccination campaign, raised by hand over one Pen. */
const vaccinate = async (day: string, penId: string, tagNumber: string) => {
  const clock = new FakeClock(`${day}T08:00:00.000Z`);
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  await manager.client.instances.raiseNow({
    definitionId: world.campaign.definitionId,
    penId,
  });
  const today = await manager.client.instances.today({ penId });
  const raised = today.find(
    (candidate) => candidate.definitionId === world.campaign.definitionId
  );
  if (!raised) {
    throw new Error("expected a vaccination instance");
  }
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  await staff.client.instances.claim({ id: raised.id });
  await staff.client.instances.completeStep({
    instanceId: raised.id,
    stepId: "dose",
    animalTag: tagNumber,
    evidence: [true],
  });
};

describe("the passport and the withdrawal summary", () => {
  it("puts everything the farm knows about her on one page", async () => {
    await vaccinate("2027-07-02", world.pen.id, tagOf(0));
    // She is walked to the other pen, so her thirty days have two places in them.
    const manager = await asManager("2027-07-05");
    await manager.client.animals.move({
      tagNumber: tagOf(0),
      toPenId: world.second.id,
      reason: "regrouped",
    });

    const passport = await manager.client.papers.passport({
      tagNumber: tagOf(0),
    });
    // What she is, where she came from, where she has stood, and what she has had.
    expect(passport.text).toContain(tagOf(0));
    expect(passport.text).toContain("শাহীওয়াল");
    expect(passport.text).toContain(`হাট ${suffix}`);
    expect(passport.text).toContain(`পেন ক ${suffix}`);
    expect(passport.text).toContain(`পেন খ ${suffix}`);
    expect(passport.text).toContain(`ক্ষুরারোগ টিকা ${suffix}`);
    // And the farm that vouches for it.
    expect(passport.text).toContain("খামার");
  });

  it("says she was bought and when she came, not when she was written down", async () => {
    // Bought on 20 June and entered on 1 July: a farm writes up an intake when it gets to the office.
    const manager = await asManager("2027-07-06");
    const late = await manager.client.intake.record({
      penId: world.pen.id,
      sex: "male",
      seller: { name: `দেরির হাট ${suffix}`, address: "সাভার হাট" },
      purchasePriceBdt: 80_000,
      weightKg: 250,
      estimatedAgeMonths: 22,
      arrivedAt: "2027-06-20T04:00:00.000Z",
    });
    const paper = await manager.client.papers.passport({
      tagNumber: late.tagNumber,
    });
    expect(paper.text).toContain("bought from");
    expect(paper.text).toContain(`দেরির হাট ${suffix}`);
    // The day the Intake says she came.
    expect(paper.text).toContain("২০ জুন, ২০২৭");

    // An animal the farm wrote into its opening register was bought all the same, and her paper says so.
    const already = await manager.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.pen.id,
      source: "bought",
      aliases: [],
    });
    const hers = await manager.client.papers.passport({
      tagNumber: already.tagNumber,
    });
    expect(hers.text).toContain("কেনা / bought");
    expect(hers.text).not.toContain("born here");
  });

  it("answers the sharp question: clear, or not clear, and until when", async () => {
    // Vaccinated on 2 July, and the vaccine holds meat for twenty-one days.
    const manager = await asManager("2027-07-10");
    const held = await manager.client.papers.withdrawalSummary({
      tagNumber: tagOf(0),
    });
    expect(held.clear).toBe(false);
    expect(held.doses).toHaveLength(1);
    expect(held.text).toContain("২৩ জুলাই");

    // Twenty-one days later she is clear, and the paper says so.
    const after = await asManager("2027-07-24");
    const free = await after.client.papers.withdrawalSummary({
      tagNumber: tagOf(0),
    });
    expect(free.clear).toBe(true);
    // The dose is still listed: it happened inside the thirty days, and a buyer asked what she
    // has had, not only whether she is clear today.
    expect(free.doses).toHaveLength(1);
  });

  it("is still readable after she has gone, which is when a vet asks", async () => {
    const manager = await asManager("2027-07-25");
    await manager.client.ready.confirm({ tagNumber: tagOf(0) });
    await manager.client.sale.record({
      tagNumber: tagOf(0),
      buyer: { name: `কসাই ${suffix}` },
      priceBdt: 150_000,
      weightKg: 320,
      destination: "গাবতলী",
      vehicle: "ট ১১-৯৯",
      driver: "সোহেল",
    });

    const after = await asManager("2027-07-26");
    const passport = await after.client.papers.passport({
      tagNumber: tagOf(0),
    });
    expect(passport.text).toContain(tagOf(0));
    // Where she went is part of what she is; who took her is not the next holder's business.
    expect(passport.text).toContain("গাবতলী");

    const summary = await after.client.papers.withdrawalSummary({
      tagNumber: tagOf(0),
    });
    expect(summary.clear).toBe(true);
  });

  it("says so when a vet has cut a hold short, even where it says clear", async () => {
    // The second bull is vaccinated, and then the Vet ends his hold early — which is exactly
    // the thing a slaughter vet asks the farm about.
    await vaccinate("2027-07-02", world.second.id, tagOf(1));
    const vet = await createTestClient(appRouter, {
      as: "vet",
      clock: new FakeClock("2027-07-06T09:00:00.000Z"),
    });
    await vet.client.withdrawals.shorten({
      animalTag: tagOf(1),
      meatUntil: null,
      reason: "টিকার ব্যাচ বদলেছে — অপেক্ষার প্রয়োজন নেই",
    });

    const manager = await asManager("2027-07-07");
    const summary = await manager.client.papers.withdrawalSummary({
      tagNumber: tagOf(1),
    });
    // Clear — but the farm says on whose word, and what the doses alone would have held her to.
    expect(summary.clear).toBe(true);
    expect(summary.text).toContain("ভেট অপেক্ষমাণ সময় কমিয়েছেন");
    expect(summary.text).toContain("২৩ জুলাই");
    expect(summary.text).toContain("টিকার ব্যাচ বদলেছে");

    // And her passport says it too, so the two papers cannot tell a buyer different things.
    const passport = await manager.client.papers.passport({
      tagNumber: tagOf(1),
    });
    expect(passport.text).toContain("ভেট অপেক্ষমাণ সময় কমিয়েছেন");
  });

  it("is the Vet's to produce as well, and never a milker's", async () => {
    const clock = new FakeClock("2027-07-26T09:00:00.000Z");
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    const staff = await createTestClient(appRouter, { as: "staff", clock });

    // A slaughter vet asks for these, so the Vet may produce them.
    const theirs = await vet.client.papers.withdrawalSummary({
      tagNumber: tagOf(0),
    });
    expect(theirs.clear).toBe(true);

    await expect(
      staff.client.papers.passport({ tagNumber: tagOf(0) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // And producing one is recorded, because a paper that went is the farm's evidence.
    const manager = await asManager("2027-07-26");
    const her = await manager.client.animals.byTag({ tagNumber: tagOf(0) });
    const trail = await manager.client.audit.list({
      entity: "animal",
      entityId: her.id,
    });
    expect(
      trail.some(
        (event) =>
          event.action === "export" &&
          (event.after as { paper?: string } | null)?.paper === "passport"
      )
    ).toBe(true);
  });

  it("says she stood in her last Pen only until she died, not that she stands there still", async () => {
    const manager = await asManager("2027-07-27");
    await manager.client.animals.recordMortality({
      tagNumber: tagOf(1),
      kind: "died",
      cause: "হঠাৎ মৃত্যু",
      disposal: "buried",
    });

    const after = await asManager("2027-07-28");
    const passport = await after.client.papers.passport({
      tagNumber: tagOf(1),
    });
    const lastPen = passport.text
      .split("\n")
      .find((line) => line.includes(`পেন খ ${suffix}`));
    // A spell with an end, as a sold animal's has: a line ending on its dash would say she is in that Pen today.
    expect(lastPen).toMatch(/ – \S/u);
  });
});

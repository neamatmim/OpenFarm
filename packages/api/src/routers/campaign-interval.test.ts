import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Campaign that comes round: a deworming every four months, counted from each heifer's last dose of the drench. Its
 * own word for the heifers it walks, so the Pens of other tests in this file are its Pens too only while they hold some.
 */
const comingRound = (productId: string): SopContent => ({
  name: { bn: "চার মাস অন্তর কৃমিনাশক", en: "Deworming every four months" },
  purpose: { bn: "পেনের প্রতিটি বকনাকে কৃমিনাশক খাওয়ান" },
  triggers: [{ kind: "every_months", months: 4 }],
  appliesTo: { side: "dairy", states: ["heifer"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 240,
  steps: [
    {
      id: "dose",
      text: { bn: "কৃমিনাশক খাওয়ান" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "অসুস্থ — পরে দেওয়া হবে", means: "unwell" }],
      effect: { kind: "treatment", productId },
    },
  ],
});

let definitionId = "";
let shedId = "";

beforeAll(async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const vet = await createTestClient(appRouter, { as: "vet" });
  await createTestClient(appRouter, { as: "staff" });
  const shed = await owner.client.sheds.create({
    name: `interval-${Date.now()}`,
  });
  shedId = shed.id;
  const drench = await vet.client.drugs.create({
    name: { bn: `লেভামিসল ${Date.now()}`, en: "Levamisole" },
    milkWithdrawalDays: 3,
    meatWithdrawalDays: 14,
  });
  ({ definitionId } = await owner.client.sops.create({
    content: comingRound(drench.id),
  }));
});

/** A Pen of heifers registered on the clock's day, walked by the file's Barn Staff member. */
const aPenOfHeifers = async (clock: FakeClock, count: number) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const pen = await owner.client.sheds.pens.create({
    shedId,
    name: `বকনা ${Date.now()}`,
  });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-interval-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const heifers = [];
  for (let i = 0; i < count; i += 1) {
    // Sequential: tag numbers are handed out in order.
    // oxlint-disable-next-line no-await-in-loop
    const heifer = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    heifers.push(heifer);
  }
  return { pen, heifers };
};

/** The farm turns its day on the clock's day, and says which of this Campaign's work stands in the Pen. */
const campaignsIn = async (penId: string, at: string) => {
  const clock = new FakeClock(at);
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  await manager.client.work.ensureDue();
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  const work = await staff.client.work.today({ penId });
  return work.filter((row) => row.definitionId === definitionId);
};

/** This file's Campaign's work in a list of the day's work. */
const ours = (work: readonly { definitionId: string }[]) =>
  work.filter((row) => row.definitionId === definitionId);

/** Barn Staff walk the Pen's Campaign, dosing every heifer. */
const doseThemAll = async (
  campaignId: string,
  tags: readonly string[],
  at: string
) => {
  const staff = await createTestClient(appRouter, {
    as: "staff",
    clock: new FakeClock(at),
  });
  await staff.client.work.claim({ id: campaignId });
  for (const tag of tags) {
    // oxlint-disable-next-line no-await-in-loop
    await staff.client.work.completeStep({
      instanceId: campaignId,
      stepId: "dose",
      animalTag: tag,
      evidence: [true],
    });
  }
  await staff.client.work.complete({ id: campaignId });
};

describe("a Campaign that comes round by its interval", () => {
  it("is raised in a Pen the day its heifers come due, and once for that turn however often the day turns", async () => {
    const { pen } = await aPenOfHeifers(
      new FakeClock("2030-01-05T03:30:00.000Z"),
      2
    );

    // Four months from when they were first counted, not the day they came: nothing yet the day before.
    expect(await campaignsIn(pen.id, "2030-05-04T04:00:00.000Z")).toEqual([]);
    expect(await campaignsIn(pen.id, "2030-05-05T04:00:00.000Z")).toHaveLength(
      1
    );
    expect(await campaignsIn(pen.id, "2030-05-05T10:00:00.000Z")).toHaveLength(
      1
    );
  });

  it("comes round again the interval after the heifers were dosed, and not before", async () => {
    const { pen, heifers } = await aPenOfHeifers(
      new FakeClock("2031-01-05T03:30:00.000Z"),
      2
    );
    const [campaign] = await campaignsIn(pen.id, "2031-05-05T04:00:00.000Z");
    if (!campaign) {
      throw new Error("expected the Campaign raised");
    }
    await doseThemAll(
      campaign.id,
      heifers.map((heifer) => heifer.tagNumber),
      "2031-05-06T04:00:00.000Z"
    );

    expect(await campaignsIn(pen.id, "2031-07-01T04:00:00.000Z")).toEqual([]);
    expect(await campaignsIn(pen.id, "2031-09-05T04:00:00.000Z")).toEqual([]);
    const again = await campaignsIn(pen.id, "2031-09-06T04:00:00.000Z");
    expect(again).toHaveLength(1);
    expect(again[0]?.id).not.toBe(campaign.id);
  });

  it("counts a dose given in a Campaign raised by hand, so the heifers are not due again four months from when they came", async () => {
    const { pen, heifers } = await aPenOfHeifers(
      new FakeClock("2032-01-05T03:30:00.000Z"),
      1
    );
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2032-03-01T04:00:00.000Z"),
    });
    await manager.client.work.raiseNow({ definitionId, penId: pen.id });
    const [byHand] = await campaignsIn(pen.id, "2032-03-01T04:30:00.000Z");
    if (!byHand) {
      throw new Error("expected the Campaign raised by hand");
    }
    await doseThemAll(
      byHand.id,
      heifers.map((heifer) => heifer.tagNumber),
      "2032-03-01T05:00:00.000Z"
    );

    expect(await campaignsIn(pen.id, "2032-05-05T04:00:00.000Z")).toEqual([]);
    expect(await campaignsIn(pen.id, "2032-07-01T04:00:00.000Z")).toHaveLength(
      1
    );
  });
});

describe("a Campaign the turn leaves alone", () => {
  it("raised by hand on the day it falls due, gets no second one from the turn", async () => {
    const { pen } = await aPenOfHeifers(
      new FakeClock("2035-01-05T03:30:00.000Z"),
      1
    );
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2035-05-05T02:00:00.000Z"),
    });
    await manager.client.work.raiseNow({ definitionId, penId: pen.id });

    expect(await campaignsIn(pen.id, "2035-05-05T02:30:00.000Z")).toHaveLength(
      1
    );
  });

  it("left Missed, is not raised again by itself the next day", async () => {
    const { pen } = await aPenOfHeifers(
      new FakeClock("2036-01-05T03:30:00.000Z"),
      1
    );
    const [campaign] = await campaignsIn(pen.id, "2036-05-05T04:00:00.000Z");
    if (!campaign) {
      throw new Error("expected the Campaign raised");
    }
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2036-05-05T12:00:00.000Z"),
    });
    await manager.client.work.closeAsMissed({
      id: campaign.id,
      reason: "টিকা পাওয়া যায়নি",
    });

    expect(await campaignsIn(pen.id, "2036-05-06T04:00:00.000Z")).toEqual([]);
  });
});

describe("a Campaign raised by hand", () => {
  it("is raised in every Pen chosen at once, one piece of work for each, and asking again raises nothing more", async () => {
    const clock = new FakeClock("2033-02-01T04:00:00.000Z");
    const first = await aPenOfHeifers(clock, 1);
    const second = await aPenOfHeifers(clock, 1);
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    const raised = await manager.client.work.raiseNow({
      definitionId,
      penIds: [first.pen.id, second.pen.id],
    });
    expect(raised.raised).toBe(2);
    expect(
      await manager.client.work.raiseNow({
        definitionId,
        penIds: [first.pen.id, second.pen.id],
      })
    ).toEqual({ raised: 0 });

    const staff = await createTestClient(appRouter, { as: "staff", clock });
    for (const pen of [first.pen, second.pen]) {
      // oxlint-disable-next-line no-await-in-loop
      const work = await staff.client.work.today({ penId: pen.id });
      expect(ours(work)).toEqual([expect.objectContaining({ penId: pen.id })]);
    }
  });
});

describe("who is due a Campaign", () => {
  it("names each heifer due or coming due, with her last dose and her day, for the Vet and the Manager", async () => {
    const { pen, heifers } = await aPenOfHeifers(
      new FakeClock("2034-01-10T03:30:00.000Z"),
      2
    );
    const [dosed, never] = heifers;
    if (!(dosed && never)) {
      throw new Error("expected two heifers");
    }
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2034-02-01T04:00:00.000Z"),
    });
    await manager.client.work.raiseNow({ definitionId, penId: pen.id });
    const [campaign] = await campaignsIn(pen.id, "2034-02-01T04:30:00.000Z");
    if (!campaign) {
      throw new Error("expected the Campaign raised by hand");
    }
    const staff = await createTestClient(appRouter, {
      as: "staff",
      clock: new FakeClock("2034-02-01T05:00:00.000Z"),
    });
    await staff.client.work.claim({ id: campaign.id });
    await staff.client.work.completeStep({
      instanceId: campaign.id,
      stepId: "dose",
      animalTag: dosed.tagNumber,
      evidence: [true],
    });
    await staff.client.work.completeStep({
      instanceId: campaign.id,
      stepId: "dose",
      animalTag: never.tagNumber,
      evidence: [],
      skipReason: "অসুস্থ — পরে দেওয়া হবে",
    });
    await staff.client.work.complete({ id: campaign.id });

    const vet = await createTestClient(appRouter, {
      as: "vet",
      clock: new FakeClock("2034-05-05T04:00:00.000Z"),
    });
    const due = await vet.client.treatments.campaignsDue();
    const thisOne = due.find((one) => one.definitionId === definitionId);
    const inThePen = (thisOne?.animals ?? []).filter(
      (one) => one.penId === pen.id
    );
    // The one skipped as unwell is owed it four months from when she was first counted, five days off; the one dosed in
    // February is not owed it until June, too far off to be named.
    expect(inThePen).toEqual([
      expect.objectContaining({
        tagNumber: never.tagNumber,
        lastGivenOn: null,
        dueOn: "2034-05-10",
        standing: "soon",
      }),
    ]);
    expect(thisOne?.months).toBe(4);

    const later = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2034-06-02T04:00:00.000Z"),
    });
    const dueLater = await later.client.treatments.campaignsDue();
    const both = dueLater
      .find((one) => one.definitionId === definitionId)
      ?.animals.filter((one) => one.penId === pen.id);
    expect(both).toEqual([
      expect.objectContaining({ tagNumber: never.tagNumber, standing: "due" }),
      expect.objectContaining({
        tagNumber: dosed.tagNumber,
        lastGivenOn: "2034-02-01",
        dueOn: "2034-06-01",
        standing: "due",
      }),
    ]);

    const barn = await createTestClient(appRouter, { as: "staff" });
    await expect(barn.client.treatments.campaignsDue()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

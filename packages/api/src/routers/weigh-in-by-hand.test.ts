import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Venture already running when the farm went onto the app brings bulls that have been weighed on paper for months.
 * Typed on their page with the day each was taken, those readings are what their gain is read from — not the first
 * round after the day they were typed in.
 */
const suffix = `weigh-by-hand-${Date.now()}`;

const ARRIVED = "2086-02-01T04:00:00.000Z";
const PAPER_MARCH = "2086-03-01T03:00:00.000Z";
const PAPER_APRIL = "2086-04-01T03:00:00.000Z";
/** The day the farm types them in. */
const TODAY = "2086-05-02T06:00:00.000Z";

const as = (role: "owner" | "manager" | "staff", instant = TODAY) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const tags = {
  paper: "",
  jump: "",
  dip: "",
  refused: "",
  fix: "",
  gone: "",
  round: "",
};
/** The scale round, which weighs the one bull whose reading is a Step's. */
const ROUND = "2086-04-20T02:00:00.000Z";

const weighInSop = (): SopContent => ({
  name: { bn: `ওজন ${suffix}` },
  purpose: { bn: "প্রতিটি পশুর ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 240,
  steps: [
    {
      id: "weigh",
      text: { bn: "ক্রাশে তুলে ওজন নিন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "কেজি" },
          min: 20,
          max: 1200,
        },
      ],
      skipReasons: [{ bn: "ক্রাশে ওঠেনি" }],
      effect: { kind: "weigh_in" },
    },
  ],
});

beforeAll(async () => {
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.sheds.create({ name: suffix });
  const pen = await manager.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ষাঁড় ${suffix}`,
  });
  for (const key of Object.keys(tags) as (keyof typeof tags)[]) {
    // oxlint-disable-next-line no-await-in-loop -- one bull after another off the lorry
    const bull = await manager.client.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${key} ${suffix}` },
      purchasePriceMoney: 90_000,
      weightKg: 280,
      estimatedAgeMonths: 24,
      arrivedAt: new Date(ARRIVED),
      targetWindowStart: "2086-06-01",
      targetWindowEnd: "2086-06-05",
    });
    tags[key] = bull.tagNumber;
  }
  const owner = await as("owner", ARRIVED);
  const weighing = await owner.client.sops.create({ content: weighInSop() });
  const rounds = await as("manager", ROUND);
  await rounds.client.work.ensureDue();
  const due = await rounds.client.work.today({ penId: pen.id });
  const work = due.find((row) => row.definitionId === weighing.definitionId);
  if (!work) {
    throw new Error("expected the weighing to be due");
  }
  await rounds.client.work.claim({ id: work.id });
  await rounds.client.work.completeStep({
    instanceId: work.id,
    stepId: "weigh",
    animalTag: tags.round,
    evidence: [330],
  });
});

const refusalOf = async (call: Promise<unknown>) => {
  try {
    await call;
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal ?? "none";
  }
  return "taken";
};

describe("a weigh-in typed on her page with its day", () => {
  it("reads her gain from the paper readings, typed in whichever order", async () => {
    const manager = await as("manager");
    // The later one first: the earlier one, typed after, still stands before it.
    await manager.client.animals.weighIn({
      tagNumber: tags.paper,
      weightKg: 325,
      weighedAt: new Date(PAPER_APRIL),
    });
    const march = await manager.client.animals.weighIn({
      tagNumber: tags.paper,
      weightKg: 300,
      weighedAt: new Date(PAPER_MARCH),
    });
    expect(march.flaggedNote).toBeNull();
    const her = await manager.client.animals.get({ tagNumber: tags.paper });
    expect(
      her.weighIns.map((one) => [one.weightKg, one.weighedAt.toISOString()])
    ).toEqual([
      [325, PAPER_APRIL],
      [300, PAPER_MARCH],
    ]);
    expect(her.fattening?.latestKg).toBe(325);
    // Twenty-five kilos over the thirty-one days between the two paper readings, not over the day she was typed in.
    expect(her.fattening?.recent?.overDays).toBe(31);
    expect(her.fattening?.recent?.dailyGainKg).toBeCloseTo(25 / 31, 1);
    expect(her.weighIns.every((one) => one.flagged === false)).toBe(true);
  });

  it("is on the trail as the Manager's, with what was typed", async () => {
    const manager = await as("manager");
    const her = await manager.client.animals.get({ tagNumber: tags.paper });
    const march = her.weighIns.find((one) => one.weightKg === 300);
    const trail = await scratchDb().query.auditEvent.findFirst({
      where: { entity: "weigh_in", entityId: march?.id ?? "" },
      columns: { action: true, after: true, roleUsed: true },
    });
    expect(trail).toMatchObject({
      action: "create",
      roleUsed: "manager",
      after: { weightKg: "300.00", flaggedNote: null },
    });
  });

  it("keeps a reading no bull could have put on, and queries it", async () => {
    const owner = await as("owner");
    const taken = await owner.client.animals.weighIn({
      tagNumber: tags.jump,
      weightKg: 520,
      weighedAt: new Date(PAPER_MARCH),
    });
    expect(taken.flaggedNote).not.toBeNull();
    const her = await owner.client.animals.get({ tagNumber: tags.jump });
    expect(her.weighIns).toHaveLength(1);
    expect(her.weighIns[0]?.flagged).toBe(true);
  });

  it("is judged against the paper reading before it, not only against the lorry", async () => {
    const manager = await as("manager");
    await manager.client.animals.weighIn({
      tagNumber: tags.dip,
      weightKg: 340,
      weighedAt: new Date(PAPER_MARCH),
    });
    // Fifty kilos off in a fortnight is more than a bull loses. Set against the 280 kg he came at, it would pass.
    const fortnightOn = await manager.client.animals.weighIn({
      tagNumber: tags.dip,
      weightKg: 290,
      weighedAt: new Date("2086-03-15T03:00:00.000Z"),
    });
    expect(fortnightOn.flaggedNote).toContain("from 340 kg");
  });

  it("is refused on a day that has not come", async () => {
    const manager = await as("manager");
    expect(
      await refusalOf(
        manager.client.animals.weighIn({
          tagNumber: tags.refused,
          weightKg: 300,
          weighedAt: new Date("2086-05-03T03:00:00.000Z"),
        })
      )
    ).toBe("weighed_in_the_future");
  });

  it("is refused before she came off the lorry", async () => {
    const manager = await as("manager");
    expect(
      await refusalOf(
        manager.client.animals.weighIn({
          tagNumber: tags.refused,
          weightKg: 270,
          weighedAt: new Date("2086-01-20T03:00:00.000Z"),
        })
      )
    ).toBe("weighed_before_arrival");
    const her = await manager.client.animals.get({ tagNumber: tags.refused });
    expect(her.weighIns).toHaveLength(0);
  });

  it("is not Barn Staff's to type", async () => {
    const staff = await as("staff");
    await expect(
      staff.client.animals.weighIn({
        tagNumber: tags.refused,
        weightKg: 300,
        weighedAt: new Date(PAPER_MARCH),
      })
    ).rejects.toThrow();
  });
});

/** Her readings, oldest first, as her page has them. */
const readingsOf = async (tag: string) => {
  const manager = await as("manager");
  const her = await manager.client.animals.get({ tagNumber: tag });
  return her.weighIns.toReversed();
};

/** A Mid-March pair, the first typed 50 kg heavy: the second reads as a loss no bull makes. */
const typedHeavy = async (tag: string) => {
  const manager = await as("manager");
  await manager.client.animals.weighIn({
    tagNumber: tag,
    weightKg: 340,
    weighedAt: new Date(PAPER_MARCH),
  });
  await manager.client.animals.weighIn({
    tagNumber: tag,
    weightKg: 290,
    weighedAt: new Date("2086-03-15T03:00:00.000Z"),
  });
};

describe("a weigh-in typed on her page, put right", () => {
  it("lifts the doubt it cast on the reading after it", async () => {
    await typedHeavy(tags.fix);
    const [first, second] = await readingsOf(tags.fix);
    expect(second?.flagged).toBe(true);
    const owner = await as("owner");
    await owner.client.animals.correctWeighIn({
      id: first?.id ?? "",
      reason: "৩৪০ নয়, খাতায় ৩০০ লেখা",
      changes: { weightKg: { from: 340, to: 300 } },
    });
    const after = await readingsOf(tags.fix);
    expect(after.map((one) => [one.weightKg, one.flagged])).toEqual([
      [300, false],
      [290, false],
    ]);
  });

  it("takes one off her record, with the reason on the trail", async () => {
    await typedHeavy(tags.gone);
    const [first] = await readingsOf(tags.gone);
    const manager = await as("manager");
    await manager.client.animals.correctWeighIn({
      id: first?.id ?? "",
      reason: "অন্য ষাঁড়ের ওজন",
      changes: { voided: { from: false, to: true } },
    });
    const after = await readingsOf(tags.gone);
    // The one left is set against what he came at again, and stands.
    expect(after.map((one) => [one.weightKg, one.flagged])).toEqual([
      [290, false],
    ]);
    const trail = await scratchDb().query.auditEvent.findFirst({
      where: {
        entity: "weigh_in",
        entityId: first?.id ?? "",
        action: "correct",
      },
      columns: { reason: true },
    });
    expect(trail?.reason).toBe("অন্য ষাঁড়ের ওজন");
  });

  it("is refused a moment before he came off the lorry", async () => {
    const [first] = await readingsOf(tags.fix);
    const owner = await as("owner");
    expect(
      await refusalOf(
        owner.client.animals.correctWeighIn({
          id: first?.id ?? "",
          reason: "দিন ভুল",
          changes: {
            weighedAt: {
              from: new Date(PAPER_MARCH),
              to: new Date("2086-01-20T03:00:00.000Z"),
            },
          },
        })
      )
    ).toBe("weighed_before_arrival");
  });

  it("is not how a round's reading is put right", async () => {
    const [read] = await readingsOf(tags.round);
    expect(read?.byHand).toBe(false);
    const owner = await as("owner");
    expect(
      await refusalOf(
        owner.client.animals.correctWeighIn({
          id: read?.id ?? "",
          reason: "ভুল",
          changes: { weightKg: { from: 330, to: 300 } },
        })
      )
    ).toBe("not_on_the_farm");
    const [still] = await readingsOf(tags.round);
    expect(still?.weightKg).toBe(330);
  });

  it("is not Barn Staff's to put right", async () => {
    const [first] = await readingsOf(tags.fix);
    expect(first?.byHand).toBe(true);
    const staff = await as("staff");
    await expect(
      staff.client.animals.correctWeighIn({
        id: first?.id ?? "",
        reason: "ভুল",
        changes: { weightKg: { from: 300, to: 310 } },
      })
    ).rejects.toThrow();
  });
});

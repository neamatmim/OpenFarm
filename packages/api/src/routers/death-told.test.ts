import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { PushMessage, PushTarget, PushTransport } from "../push";
import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

/**
 * A death or a cull written by anyone but the Owner is told to the Owner at once, by push: her tag, died or culled, the
 * cause, what she cost, and whose she was where she was a Venture's. A tap opens her page.
 */
const suffix = `death-told-${Date.now()}`;
const DAY = "2090-04-01";
/** Ten in the morning, farm time. */
const AWAKE = `${DAY}T04:00:00.000Z`;
/** Eleven at night, farm time: inside the farm's quiet hours. */
const ASLEEP = `${DAY}T17:00:00.000Z`;
const ENDPOINT = `https://fcm.googleapis.com/fcm/send/${suffix}`;

/** Everything the farm tried to push, and to whom. */
const sent: { target: PushTarget; message: PushMessage }[] = [];
const transport: PushTransport = {
  send: (target, message) => {
    sent.push({ target, message });
    return Promise.resolve({ delivered: true, gone: false });
  },
};

const as = (role: "owner" | "manager", instant = AWAKE) =>
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
  died: "",
  venture: "",
  byOwner: "",
  asleep: "",
  stillborn: "",
};
let ventureName = "";

const theirs = (tag: string) =>
  sent.filter(
    (one) => one.target.endpoint === ENDPOINT && one.message.body.includes(tag)
  );

const toldOf = async (tag: string, role: "owner" | "manager") => {
  const her = await scratchDb().query.animal.findFirst({
    where: { tagNumber: tag, farmId: theFarm().id },
    columns: { id: true },
    with: { mortality: { columns: { id: true } } },
  });
  return await scratchDb().query.alert.findMany({
    where: {
      kind: "mortality_recorded",
      entityId: her?.mortality?.id ?? "",
      userId: thePerson(role).id,
    },
    columns: { params: true },
  });
};

const died = async (
  tagNumber: string,
  {
    by = "manager",
    instant = AWAKE,
  }: { by?: "owner" | "manager"; instant?: string } = {}
) => {
  const writer = await as(by, instant);
  await writer.client.animals.recordMortality({
    tagNumber,
    kind: "died",
    cause: `পেট ফাঁপা ${suffix}`,
    disposal: "buried",
    photo: A_DEATH_PHOTO,
  });
};

beforeAll(async () => {
  const owner = await as("owner", `${DAY}T01:00:00.000Z`);
  await as("manager", `${DAY}T01:00:00.000Z`);
  await owner.client.push.subscribe({
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
  const bull = async (extra: Record<string, unknown> = {}) => {
    const bought = await owner.client.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 80_000,
      weightKg: 250,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(`${DAY}T01:00:00.000Z`),
      targetWindowStart: "2090-06-01",
      targetWindowEnd: "2090-06-05",
      ...extra,
    });
    return bought.tagNumber;
  };
  tags.died = await bull();
  tags.byOwner = await bull();
  tags.asleep = await bull();
  ventureName = `ভেঞ্চার ${suffix}`;
  const venture = await owner.client.ventures.open({
    name: ventureName,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2090-04-01",
    targetWindowStart: "2090-09-01",
    targetWindowEnd: "2090-09-05",
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  await putCapitalIn(
    owner.client,
    { id: venture.id, units: 20, unitPriceMoney: 50_000 },
    suffix,
    "2090-04-01"
  );
  await owner.client.ventures.startBuying({ id: venture.id });
  tags.venture = await bull({
    ventureId: venture.id,
    targetWindowStart: undefined,
    targetWindowEnd: undefined,
    ...PAID_FROM_THE_ACCOUNT,
  });
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
    expectedCalvingOn: "2090-04-02",
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

describe("a death told to the Owner", () => {
  it("is told at once when the Manager writes it: her tag, the cause and what she cost, pushed to her page", async () => {
    await died(tags.died);
    const told = await toldOf(tags.died, "owner");
    expect(told).toEqual([
      {
        params: expect.objectContaining({
          tag: tags.died,
          kind: "died",
          cause: `পেট ফাঁপা ${suffix}`,
          costMoney: 80_000,
          venture: null,
        }),
      },
    ]);
    const pushed = theirs(tags.died);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.message.url).toBe(`/animals/${tags.died}`);
    // The Manager wrote it: the Manager is not told it.
    expect(await toldOf(tags.died, "manager")).toEqual([]);
  });

  it("names whose she was, where she was a Venture's, and still only the Owner hears", async () => {
    await died(tags.venture);
    const told = await toldOf(tags.venture, "owner");
    expect(told[0]?.params).toMatchObject({ venture: ventureName });
  });

  it("tells the Owner nothing of a death she wrote herself", async () => {
    await died(tags.byOwner, { by: "owner" });
    expect(await toldOf(tags.byOwner, "owner")).toEqual([]);
    expect(theirs(tags.byOwner)).toEqual([]);
  });

  it("tells nobody of a Correction", async () => {
    const manager = await as("manager", `${DAY}T05:00:00.000Z`);
    await manager.client.animals.correctMortality({
      tagNumber: tags.died,
      reason: `আসলে বিষক্রিয়া ${suffix}`,
      changes: {
        cause: { from: `পেট ফাঁপা ${suffix}`, to: `বিষক্রিয়া ${suffix}` },
      },
    });
    expect(await toldOf(tags.died, "owner")).toHaveLength(1);
    expect(theirs(tags.died)).toHaveLength(1);
  });

  it("is in her list but not pushed in the quiet hours", async () => {
    await died(tags.asleep, { instant: ASLEEP });
    expect(await toldOf(tags.asleep, "owner")).toHaveLength(1);
    expect(theirs(tags.asleep)).toEqual([]);
  });

  it("is pushed in the morning, once, when the quiet hours end", async () => {
    // Eight the next morning, farm time: the farm is awake, and the first sweep carries what the night held.
    const morning = await as("owner", "2090-04-02T02:00:00.000Z");
    await morning.client.alerts.sweep();
    expect(theirs(tags.asleep)).toHaveLength(1);
    // And once: the next sweep has nothing left to carry.
    await morning.client.alerts.sweep();
    expect(theirs(tags.asleep)).toHaveLength(1);
  });

  it("is told of a stillborn calf when her disposal is written, not at her Calving", async () => {
    expect(await toldOf(tags.stillborn, "owner")).toEqual([]);
    const manager = await as("manager", `${DAY}T06:00:00.000Z`);
    await manager.client.animals.recordDisposal({
      tagNumber: tags.stillborn,
      disposal: "buried",
      photo: A_DEATH_PHOTO,
    });
    expect(await toldOf(tags.stillborn, "owner")).toHaveLength(1);
  });

  it("is said as born dead on the Owner's home, never counted as died as well", async () => {
    const owner = await as("owner", `${DAY}T08:00:00.000Z`);
    const { tiles } = await owner.client.overview.get();
    const deaths = await scratchDb().query.mortality.findMany({
      where: { farmId: theFarm().id, kind: "died" },
      columns: { id: true },
    });
    // The stillborn calf of this file is one of its deaths, and in the born-dead line alone.
    expect(tiles.bornDead).toBeGreaterThanOrEqual(1);
    expect(tiles.died + tiles.bornDead).toBe(deaths.length);
  });
});

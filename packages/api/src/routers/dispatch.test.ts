import { eq } from "@OpenFarm/db/operators";
import { animal, penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The milk Dispatch: the Bulk milk leaves the farm to a buyer, and that hand-over is the farm's
// milk-buyer record (Safe Food Act s.38). The dispatch record and the production report come from
// it and from the Milk Records.

const suffix = `${Date.now()}`;

const milkingSop = (): SopContent => ({
  name: { bn: `দোহন ${suffix}`, en: "Milking" },
  purpose: { bn: "প্রতিটি গাভীর দুধ সংগ্রহ" },
  triggers: [{ kind: "schedule", times: ["05:00"] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 90,
  steps: [
    {
      id: "milk",
      text: { bn: "গাভীর দুধ দোহন করুন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "লিটার" },
          min: 0,
          max: 40,
        },
      ],
      skipReasons: [{ bn: "অসুস্থ" }],
      effect: { kind: "milk_record" },
    },
    {
      id: "bulk",
      text: { bn: "বাল্ক ট্যাংকে মোট" },
      repeatPerAnimal: false,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "লিটার" },
          min: 0,
          max: 5000,
        },
      ],
      skipReasons: [],
      effect: { kind: "bulk_total" },
    },
  ],
});

const setup = async () => {
  const clock = new FakeClock("2036-01-01T00:00:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const shed = await owner.client.herd.createShed({ name: `dp-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `দোহনের ঘর ${suffix}`,
  });
  const milkingCow = async () => {
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state: "pregnant_heifer",
    });
    await owner.client.animals.setState({
      tagNumber: cow.tagNumber,
      state: "milking",
    });
    return cow;
  };
  const clear = await milkingCow();
  const held = await milkingCow();
  // She is inside a milk Withdrawal all year: her milk is poured away whatever anybody picks.
  await scratchDb()
    .update(animal)
    .set({ milkWithdrawalUntil: new Date("2036-12-31T00:00:00.000Z") })
    .where(eq(animal.tagNumber, held.tagNumber));
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-dp-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();
  const sop = await owner.client.sops.create({ content: milkingSop() });

  // The morning milking of 1 February: 12 litres to the tank, 8 poured away under the Withdrawal.
  const morning = new FakeClock("2036-02-01T00:30:00.000Z");
  const scheduler = await createTestClient(appRouter, {
    as: "owner",
    clock: morning,
  });
  await scheduler.client.instances.ensureDue();
  const today = await scheduler.client.instances.today({ penId: pen.id });
  const work = today.find((row) => row.definitionId === sop.definitionId);
  const staff = await createTestClient(appRouter, {
    as: "staff",
    clock: morning,
  });
  await staff.client.instances.claim({ id: work?.id ?? "" });
  await staff.client.instances.completeStep({
    instanceId: work?.id ?? "",
    stepId: "milk",
    animalTag: clear.tagNumber,
    evidence: [12],
  });
  await staff.client.instances.completeStep({
    instanceId: work?.id ?? "",
    stepId: "milk",
    animalTag: held.tagNumber,
    evidence: [8],
  });
  await staff.client.instances.completeStep({
    instanceId: work?.id ?? "",
    stepId: "bulk",
    evidence: [12],
  });
  await staff.client.instances.complete({ id: work?.id ?? "" });
  return { pen, sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const { and, inArray } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { sopInstance } = await import("@OpenFarm/db/schema/instance");
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.sop.definitionId));
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.definitionId, world.sop.definitionId),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
  await db
    .delete(penAssignment)
    .where(eq(penAssignment.id, `pa-dp-${world.pen.id}`));
});

const buyer = {
  name: `মিল্ক ভিটা সংগ্রহ কেন্দ্র ${suffix}`,
  address: "বাঘাবাড়ী, শাহজাদপুর, সিরাজগঞ্জ",
  phone: "01711222333",
};

describe("the milk dispatch", () => {
  let dispatchId = "";

  it("records the milk handed to a buyer, and reads it beside what went into the tank that day", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2036-02-01T03:00:00.000Z"),
    });
    const recorded = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2036-02-01T02:30:00.000Z"),
      litres: 11.5,
      buyer,
      challan: "CH-0412",
      pricePerLitreBdt: 55,
      fatPercent: 4.1,
      snfPercent: 8.4,
    });
    dispatchId = recorded.id;

    const day = await manager.client.milk.day({ day: "2036-02-01" });
    // What went into the tank, from this farm's sessions that day — other files milk too, so this
    // pen's twelve litres are among it — and what left in the Dispatches.
    expect(day.toBulkLitres).toBeGreaterThanOrEqual(12);
    expect(day.dispatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: recorded.id,
          litres: 11.5,
          buyerName: buyer.name,
          challan: "CH-0412",
          pricePerLitreBdt: 55,
          fatPercent: 4.1,
          snfPercent: 8.4,
        }),
      ])
    );
    expect(day.dispatchedLitres).toBeGreaterThanOrEqual(11.5);
  });

  it("puts right a Dispatch written up wrong, with a reason", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2036-02-01T05:00:00.000Z"),
    });
    await manager.client.milk.correctDispatch({
      id: dispatchId,
      litres: 11.8,
      reason: "মাপার সময় ভুল পড়া হয়েছিল",
    });
    const day = await manager.client.milk.day({ day: "2036-02-01" });
    expect(day.dispatches.find((one) => one.id === dispatchId)?.litres).toBe(
      11.8
    );
  });

  it("produces the dispatch record with the buyer's name and address, and says it did", async () => {
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2036-02-02T04:00:00.000Z"),
    });
    const record = await owner.client.reports.milkDispatchRecord({
      from: "2036-02-01",
      to: "2036-02-01",
    });
    expect(record.text).toContain(buyer.name);
    expect(record.text).toContain(buyer.address);
    expect(record.text).toContain("CH-0412");
    const [header, ...rows] = record.csv.trim().split("\n");
    expect(header).toBe(
      "date,litres,buyer,buyer_address,challan,fat_percent,snf_percent,note"
    );
    expect(rows.find((row) => row.includes("CH-0412"))).toBe(
      `2036-02-01,11.8,${buyer.name},"${buyer.address}",CH-0412,4.1,8.4,`
    );

    const [event] = await scratchDb().query.auditEvent.findMany({
      where: { entity: "report", action: "export" },
      orderBy: { receivedAt: "desc", id: "desc" },
      limit: 1,
    });
    expect(event?.after).toMatchObject({
      report: "milk_dispatch_record",
      from: "2036-02-01",
      to: "2036-02-01",
    });
  });

  it("produces the production report by day, session, Pen and Destination, with the withheld milk shown", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2036-02-02T04:00:00.000Z"),
    });
    const report = await manager.client.reports.milkProduction({
      from: "2036-02-01",
      to: "2036-02-01",
    });
    const [header, ...rows] = report.csv.trim().split("\n");
    expect(header).toBe(
      "date,session,shed,pen,destination,litres,under_withdrawal"
    );
    const mine = rows.filter((row) => row.includes(`দোহনের ঘর ${suffix}`));
    expect(mine.toSorted()).toEqual([
      `2036-02-01,05:00,dp-${suffix},দোহনের ঘর ${suffix},bulk,12,no`,
      `2036-02-01,05:00,dp-${suffix},দোহনের ঘর ${suffix},discard,8,yes`,
    ]);
  });

  it("is the Manager's to record, and never Barn Staff's or the Vet's to see", async () => {
    const at = new FakeClock("2036-02-03T04:00:00.000Z");
    const dispatchIt = {
      dispatchedAt: new Date("2036-02-03T02:00:00.000Z"),
      litres: 10,
      buyer,
      pricePerLitreBdt: 55,
    };
    const owner = await createTestClient(appRouter, { as: "owner", clock: at });
    await expect(owner.client.milk.dispatch(dispatchIt)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    for (const as of ["staff", "vet"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const other = await createTestClient(appRouter, { as, clock: at });
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        other.client.milk.day({ day: "2036-02-01" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        other.client.reports.milkDispatchRecord({
          from: "2036-02-01",
          to: "2036-02-01",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // Milk cannot leave before it is dispatched.
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: at,
    });
    await expect(
      manager.client.milk.dispatch({
        ...dispatchIt,
        dispatchedAt: new Date("2036-02-04T02:00:00.000Z"),
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "dispatched_in_the_future" },
    });
  });
});

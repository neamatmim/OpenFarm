import { and, eq, inArray } from "@OpenFarm/db/operators";
import { animal, penAssignment } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm, thePerson } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The milk Dispatch: the Bulk milk leaves the farm to a buyer, and that hand-over is the farm's
// milk-buyer record (Safe Food Act s.38). The dispatch record and the production report come from
// it and from the Milk Records.

const suffix = `${Date.now()}`;
const REGISTRATION = "DLS/SAV/2026/০৪২";

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
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const sop = await owner.client.sops.create({ content: milkingSop() });
  // The dispatch record is refused to a farm without its registration number, so make sure of it
  // rather than trusting whichever file ran first to have written it down. As the Manager, and only
  // when it is missing: the identity file reads the farm's trail for the Manager's write.
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  const identity = await manager.client.farm.identity();
  if (identity.registrationMissing) {
    await manager.client.farm.setIdentity({ registrationNumber: REGISTRATION });
  }

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
  return { pen, sop, held };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const db = scratchDb();
  await db
    .update(animal)
    .set({ milkWithdrawalUntil: null })
    .where(eq(animal.tagNumber, world.held.tagNumber));
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
      changes: { litres: { from: 11.5, to: 11.8 } },
      reason: "মাপার সময় ভুল পড়া হয়েছিল",
    });
    const day = await manager.client.milk.day({ day: "2036-02-01" });
    expect(day.dispatches.find((one) => one.id === dispatchId)).toMatchObject({
      litres: 11.8,
      challan: "CH-0412",
      fatPercent: 4.1,
    });

    // The Owner may put it right too, and long after the Manager's window has closed.
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2037-02-01T05:00:00.000Z"),
    });
    await owner.client.milk.correctDispatch({
      id: dispatchId,
      changes: { litres: { from: 11.8, to: 11.9 } },
      reason: "মালিকের হিসাবে ১১.৯",
    });
    const later = await owner.client.milk.day({ day: "2036-02-01" });
    expect(later.dispatches.find((one) => one.id === dispatchId)).toMatchObject(
      {
        litres: 11.9,
      }
    );
    // And back, as the challan says — the records the next test reads are the Manager's figure.
    await owner.client.milk.correctDispatch({
      id: dispatchId,
      changes: { litres: { from: 11.9, to: 11.8 } },
      reason: "চালানে ১১.৮ লেখা",
    });
  });

  it("clears a figure written against the wrong lorry, and keeps the buyer as they stood that day", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2036-02-05T03:00:00.000Z"),
    });
    const wrong = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2036-02-05T02:00:00.000Z"),
      litres: 9,
      buyer: { name: `ঘোষ ${suffix}`, address: "উল্লাপাড়া" },
      challan: "CH-0999",
      pricePerLitreBdt: 52,
      snfPercent: 8.2,
      note: "অন্য গাড়ির",
    });
    await manager.client.milk.correctDispatch({
      id: wrong.id,
      changes: {
        challan: { from: "CH-0999", to: null },
        snfPercent: { from: 8.2, to: null },
        note: { from: "অন্য গাড়ির", to: null },
      },
      reason: "অন্য গাড়ির চালান লেখা হয়েছিল",
    });
    const day = await manager.client.milk.day({ day: "2036-02-05" });
    expect(day.dispatches.find((one) => one.id === wrong.id)).toMatchObject({
      litres: 9,
      challan: null,
      snfPercent: null,
      note: null,
      buyerName: `ঘোষ ${suffix}`,
      buyerAddress: "উল্লাপাড়া",
    });
  });

  it("produces the dispatch record with the buyer's name and address, and says it did each time", async () => {
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2036-02-02T04:00:00.000Z"),
    });
    const period = { from: "2036-02-01", to: "2036-02-01" };
    const paper = await owner.client.reports.milkDispatchRecord({
      ...period,
      format: "paper",
    });
    expect(paper.text).toContain(buyer.name);
    expect(paper.text).toContain(buyer.address);
    expect(paper.text).toContain("CH-0412");
    expect(paper.text).toContain(REGISTRATION);
    expect(paper.csv).toBeUndefined();

    const sheet = await owner.client.reports.milkDispatchRecord({
      ...period,
      format: "csv",
    });
    // A byte-order mark so a spreadsheet opens the Bangla as Bangla, and CRLF line ends.
    expect(sheet.csv?.startsWith("\uFEFF")).toBe(true);
    const [header, ...rows] = (sheet.csv ?? "").slice(1).split("\r\n");
    expect(header).toBe(
      "date,time,litres,buyer,buyer_address,challan,fat_percent,snf_percent,note"
    );
    expect(rows.find((row) => row.includes("CH-0412"))).toBe(
      `2036-02-01,08:30,11.80,${buyer.name},"${buyer.address}",CH-0412,4.10,8.40,`
    );

    // Each Export its own event on the trail, the format among what it says. This file's own: another
    // file's Exports on a later clock are newer than these whichever order the files ran in.
    const exports = await scratchDb().query.auditEvent.findMany({
      where: { entity: "report", action: "export" },
    });
    const ours = exports.filter((event) => {
      const after = event.after as Record<string, unknown> | null;
      return (
        after?.report === "milk_dispatch_record" && after.from === period.from
      );
    });
    expect(ours.map((event) => event.after)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          format: "csv",
          registrationNumber: REGISTRATION,
          ...period,
        }),
        expect.objectContaining({ format: "paper", ...period }),
      ])
    );
    expect(new Set(ours.map((event) => event.entityId)).size).toBe(ours.length);
  });

  it("refuses a dispatch record to a farm without its registration number, and a period that runs backwards", async () => {
    // As the Manager, as the transport card's refusal does: a later test in this file reads the farm's trail for
    // the Manager's write of this number.
    const writer = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2036-02-02T04:00:00.000Z"),
    });
    await writer.client.farm.setIdentity({ registrationNumber: null });
    try {
      // A fresh client, because a Context carries the Farm as it stood when the request began.
      const owner = await createTestClient(appRouter, {
        as: "owner",
        clock: new FakeClock("2036-02-02T04:00:00.000Z"),
      });
      await expect(
        owner.client.reports.milkDispatchRecord({
          from: "2036-02-01",
          to: "2036-02-01",
          format: "paper",
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        data: {
          refusal: "farm_identity_incomplete",
          missing: "registrationNumber",
        },
      });
    } finally {
      await writer.client.farm.setIdentity({
        registrationNumber: REGISTRATION,
      });
    }
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2036-02-02T04:00:00.000Z"),
    });
    await expect(
      manager.client.reports.milkProduction({
        from: "2036-02-02",
        to: "2036-02-01",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "period_backwards" },
    });
  });

  it("writes a buyer a spreadsheet would take for a formula as plain words", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2036-02-06T04:00:00.000Z"),
    });
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2036-02-06T02:00:00.000Z"),
      litres: 7,
      buyer: { name: `=HYPERLINK("x") ${suffix}` },
      challan: "-2+3",
      pricePerLitreBdt: 50,
    });
    const sheet = await manager.client.reports.milkDispatchRecord({
      from: "2036-02-06",
      to: "2036-02-06",
      format: "csv",
    });
    const row = sheet.csv
      ?.split("\r\n")
      .find((line) => line.includes(suffix) && line.includes("HYPERLINK"));
    expect(row).toBe(
      `2036-02-06,08:00,7.00,"'=HYPERLINK(""x"") ${suffix}",,'-2+3,,,`
    );
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
    const [header, ...rows] = report.csv.slice(1).trim().split("\r\n");
    expect(header).toBe(
      "date,session,shed,pen,destination,litres,under_withdrawal"
    );
    const mine = rows.filter((row) => row.includes(`দোহনের ঘর ${suffix}`));
    expect(mine.toSorted()).toEqual([
      `2036-02-01,05:00,dp-${suffix},দোহনের ঘর ${suffix},bulk,12.00,no`,
      `2036-02-01,05:00,dp-${suffix},দোহনের ঘর ${suffix},discard,8.00,yes`,
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
          format: "csv",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // Nor from a Shed Phone: an Export is office work.
    const onShedPhone = await createTestClient(appRouter, {
      as: "manager",
      clock: at,
      onShedPhone: true,
    });
    await expect(
      onShedPhone.client.reports.milkProduction({
        from: "2036-02-01",
        to: "2036-02-01",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Milk cannot leave later than now.
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
    // Nor be put right to a later time either.
    const later = await manager.client.milk.dispatch(dispatchIt);
    await expect(
      manager.client.milk.correctDispatch({
        id: later.id,
        changes: {
          dispatchedAt: {
            from: dispatchIt.dispatchedAt,
            to: new Date("2036-02-04T02:00:00.000Z"),
          },
        },
        reason: "সময় ভুল",
      })
    ).rejects.toMatchObject({
      data: { refusal: "dispatched_in_the_future" },
    });
  });
});

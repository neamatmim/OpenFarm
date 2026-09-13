import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The accountant's export: every Money Event of a period as a CSV, and a summary of income against
// expense by Category, by Counterparty and by Side — with money the Owner has not approved marked.

const suffix = `${Date.now()}`;
const MARCH = { from: "2040-03-01", to: "2040-03-31" };
const REGISTRATION = "DLS/SAV/2026/০৪২";

const as = (
  role: "owner" | "manager" | "staff" | "vet",
  instant: string,
  onShedPhone = false
) =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(instant),
    onShedPhone,
  });

const setup = async () => {
  const manager = await as("manager", "2040-03-05T04:00:00.000Z");
  const identity = await manager.client.farm.identity();
  if (identity.registrationMissing) {
    await manager.client.farm.setIdentity({ registrationNumber: REGISTRATION });
  }
  const shed = await manager.client.herd.createShed({ name: `acc-${suffix}` });
  const pen = await manager.client.herd.createPen({
    shedId: shed.id,
    name: `হিসাব ${suffix}`,
  });

  // Milk sold: 100 litres at 50.
  const milk = await manager.client.milk.dispatch({
    dispatchedAt: new Date("2040-03-05T02:00:00.000Z"),
    litres: 100,
    buyer: { name: `মিল্ক ভিটা ${suffix}` },
    challan: "CH-2040",
    pricePerLitreBdt: 50,
    paymentMethod: "bank",
  });
  // A bull bought for 30,000: over the threshold, and not yet approved.
  const bull = await manager.client.intake.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `গাবতলী ${suffix}` },
    purchasePriceBdt: 30_000,
    weightKg: 240,
    estimatedAgeMonths: 20,
    targetWindowStart: "2040-06-01",
    targetWindowEnd: "2040-06-05",
  });
  const categories = await manager.client.money.categories();
  const keyed = (key: string) =>
    categories.find((one) => one.key === key)?.id ?? "";
  // The electricity for the milking parlour, and a milker's wage.
  const power = await manager.client.money.enter({
    categoryId: keyed("utilities"),
    amountBdt: 3000,
    occurredOn: "2040-03-05",
    counterparty: { name: `পল্লী বিদ্যুৎ ${suffix}` },
    paymentMethod: "bkash",
    side: "dairy",
    note: "ফেব্রুয়ারির বিল",
  });
  const wage = await manager.client.money.enter({
    categoryId: keyed("wages"),
    amountBdt: 12_000,
    occurredOn: "2040-03-05",
    counterparty: { name: `রহিম ${suffix}` },
    wageMonth: "2040-02",
  });
  return { milk, bull, power, wage };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

describe("the accountant's export", () => {
  it("lists every Money Event of the period, with money not yet approved marked", async () => {
    const owner = await as("owner", "2040-04-01T04:00:00.000Z");
    const { csv } = await owner.client.reports.accountantExport({
      ...MARCH,
      format: "csv",
    });
    const [header, ...rows] = (csv ?? "").slice(1).trim().split("\r\n");
    expect(header).toBe(
      "date,direction,amount_bdt,category,counterparty,payment_method,side,record,record_id,reference,approval,note"
    );
    const mine = (id: string) => rows.find((row) => row.includes(id));
    expect(mine(world.milk.id)).toBe(
      `2040-03-05,in,5000.00,দুধ বিক্রি,মিল্ক ভিটা ${suffix},bank,dairy,dispatch,${world.milk.id},CH-2040,not_needed,`
    );
    expect(mine(world.bull.intakeId)).toBe(
      `2040-03-05,out,30000.00,গরু কেনা,গাবতলী ${suffix},cash,fattening,intake,${world.bull.intakeId},${world.bull.tagNumber},awaiting_approval,`
    );
    expect(mine(world.power.id)).toBe(
      `2040-03-05,out,3000.00,বিদ্যুৎ ও পানি,পল্লী বিদ্যুৎ ${suffix},bkash,dairy,by_hand,${world.power.id},,not_needed,ফেব্রুয়ারির বিল`
    );
    expect(mine(world.wage.id)).toBe(
      `2040-03-05,out,12000.00,মজুরি,রহিম ${suffix},cash,,by_hand,${world.wage.id},2040-02,not_needed,`
    );
  });

  it("sums income against expense by Category, by Counterparty and by Side, headed by the farm", async () => {
    const manager = await as("manager", "2040-04-01T04:00:00.000Z");
    const { text, summary } = await manager.client.reports.accountantExport({
      ...MARCH,
      format: "paper",
    });
    expect(summary).toMatchObject({
      incomeBdt: 5000,
      expenseBdt: 45_000,
      netBdt: -40_000,
      awaiting: { count: 1, amountBdt: 30_000 },
    });
    expect(summary?.byCategory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nameBn: "দুধ বিক্রি", inBdt: 5000, outBdt: 0 }),
        expect.objectContaining({ nameBn: "গরু কেনা", inBdt: 0, outBdt: 30_000 }),
        expect.objectContaining({ nameBn: "মজুরি", inBdt: 0, outBdt: 12_000 }),
      ])
    );
    expect(summary?.byCounterparty).toEqual(
      expect.arrayContaining([
        { name: `রহিম ${suffix}`, inBdt: 0, outBdt: 12_000 },
      ])
    );
    expect(summary?.bySide).toEqual([
      { side: "dairy", inBdt: 5000, outBdt: 3000 },
      { side: "fattening", inBdt: 0, outBdt: 30_000 },
      { side: null, inBdt: 0, outBdt: 12_000 },
    ]);
    expect(text).toContain(REGISTRATION);
    expect(text).toContain("আয় ও ব্যয় / Income and expense");
    expect(text).toContain(`গাবতলী ${suffix}`);

    // Each Export on the trail, naming the report and the period.
    const [event] = await scratchDb().query.auditEvent.findMany({
      where: { entity: "report", action: "export" },
      orderBy: { receivedAt: "desc", id: "desc" },
      limit: 1,
    });
    expect(event?.after).toMatchObject({
      report: "accountant_export",
      format: "paper",
      ...MARCH,
      registrationNumber: REGISTRATION,
    });
  });

  it("is the Owner's and the Manager's, from their own phones", async () => {
    for (const role of ["staff", "vet"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const other = await as(role, "2040-04-01T04:00:00.000Z");
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        other.client.reports.accountantExport({ ...MARCH, format: "csv" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // A farm that has not written its Registration number down is told so, as the other papers tell it.
    // As the Manager, because another file reads the farm's trail for the Manager's write of the number.
    const writer = await as("manager", "2040-04-01T04:00:00.000Z");
    await writer.client.farm.setIdentity({ registrationNumber: null });
    try {
      const unregistered = await as("owner", "2040-04-01T04:00:00.000Z");
      await expect(
        unregistered.client.reports.accountantExport({
          ...MARCH,
          format: "csv",
        })
      ).rejects.toMatchObject({
        data: { refusal: "farm_identity_incomplete" },
      });
    } finally {
      await writer.client.farm.setIdentity({
        registrationNumber: REGISTRATION,
      });
    }
    const onShedPhone = await as("manager", "2040-04-01T04:00:00.000Z", true);
    await expect(
      onShedPhone.client.reports.accountantExport({ ...MARCH, format: "csv" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

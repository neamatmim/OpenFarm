import { paperText, standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

// A Closed Month's figures beyond its Money Events — the cash passed between hands, Receivable written off, the cash
// counted, the bank's statement read — are the Owner's alone to change once she has closed it, as its money is, and
// what she changes is listed with the rest under "changed after closing" (ADR 0028).

const suffix = `closed-records-${Date.now()}`;
const SHOP = `দোকান ${suffix}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** After April 2071 is closed, early in May. */
const MAY = "2071-05-08T06:00:00.000Z";

let countId = "";
let tagNumber = "";
let saleId = "";
let accountId = "";
let handoverId = "";
let completionId = "";

const MONTH_CLOSED = { data: { refusal: "month_closed" } };

beforeAll(async () => {
  const owner = await as("owner", "2071-04-01T06:00:00.000Z");
  await owner.client.farm.setIdentity({
    address: `সাভার ${suffix}`,
    phone: "+8801711000096",
    registrationNumber: `DLS/SAV/2071/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2073-03-31",
  });
  const made = await owner.client.sops.create({
    content: standardPlaybook().cashCount,
  });
  countId = made.definitionId;
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  // The Owner's own bull, bought and sold on credit in April: her money waits for nobody.
  const bull = await owner.client.intakes.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2071-04-01T05:00:00.000Z"),
    targetWindowStart: "2071-08-17",
    targetWindowEnd: "2071-08-19",
  });
  ({ tagNumber } = bull);
  const seller = await as("owner", "2071-04-03T05:00:00.000Z");
  const sold = await seller.client.sales.record({
    tagNumber,
    buyer: { name: SHOP },
    priceMoney: 120_000,
    paidNowMoney: 100_000,
    promisedBy: "2071-04-20",
    weightKg: 330,
    destination: `গাবতলী ${suffix}`,
    vehicle: "ট্রাক",
    driver: `চালক ${suffix}`,
  });
  saleId = sold.id;
  // A heifer, so the weekly count of the farm's cash is raised.
  await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  const account = await owner.client.farmAccounts.create({
    kind: "mobile_money",
    name: `বিকাশ ${suffix}`,
    number: `017${String(Date.now()).slice(-8)}`,
  });
  accountId = account.id;
  // The Manager counts the cash in hand on the third Friday of April.
  const counting = await as("manager", "2071-04-17T12:30:00.000Z");
  await counting.client.work.ensureDue();
  const today = await counting.client.work.today();
  const work = today.find((row) => row.definitionId === countId);
  if (!work) {
    throw new Error("expected the weekly cash count");
  }
  await counting.client.work.claim({ id: work.id });
  await counting.client.work.completeStep({
    instanceId: work.id,
    stepId: "count",
    evidence: [0, ""],
  });
  const completion = await scratchDb().query.stepCompletion.findFirst({
    where: { instanceId: work.id, stepId: "count" },
    columns: { id: true },
  });
  completionId = completion?.id ?? "";
  // The Manager hands ৳1,000 to the Owner in April, after the count.
  const manager = await as("manager", "2071-04-20T05:00:00.000Z");
  ({ id: handoverId } = await manager.client.cash.handOver({
    from: { userId: thePerson("manager").id },
    to: { userId: thePerson("owner").id },
    amountMoney: 1000,
  }));
  const closing = await as("owner", MAY);
  await closing.client.monthlyReport.close({ month: "2071-04" });
});

/** The changes kept against one record for a closed month's paper. */
const changesKeptFor = (recordId: string) =>
  scratchDb().query.closedMonthChange.findMany({
    where: { recordId },
    columns: {
      month: true,
      source: true,
      change: true,
      about: true,
      tagNumber: true,
      beforeMoney: true,
      afterMoney: true,
    },
  });

describe("a Handover in a closed month", () => {
  it("is refused to the Manager backdated into it", async () => {
    const manager = await as("manager", MAY);
    await expect(
      manager.client.cash.handOver({
        from: { userId: thePerson("manager").id },
        to: { userId: thePerson("owner").id },
        amountMoney: 500,
        handedAt: new Date("2071-04-20T05:00:00.000Z"),
      })
    ).rejects.toMatchObject(MONTH_CLOSED);
  });

  it("is refused to the Manager voiding one of it, and stands", async () => {
    const manager = await as("manager", MAY);
    await expect(
      manager.client.cash.correctHandover({
        id: handoverId,
        reason: "দুবার লেখা",
        changes: { voided: { from: false, to: true } },
      })
    ).rejects.toMatchObject(MONTH_CLOSED);
    expect(
      await scratchDb().query.handover.findFirst({
        where: { id: handoverId },
        columns: { id: true },
      })
    ).toBeDefined();
  });

  it("is the Owner's to write into it, and is listed", async () => {
    const owner = await as("owner", MAY);
    const { id } = await owner.client.cash.handOver({
      from: { userId: thePerson("owner").id },
      to: { userId: thePerson("manager").id },
      amountMoney: 700,
      handedAt: new Date("2071-04-25T05:00:00.000Z"),
    });
    expect(await changesKeptFor(id)).toEqual([
      expect.objectContaining({
        month: "2071-04",
        source: "handover",
        change: "entered",
        beforeMoney: null,
        afterMoney: 700,
      }),
    ]);
  });
});

describe("Receivable written off in a closed month", () => {
  it("is listed against the month of the Sale it writes off, by the buyer and her tag", async () => {
    const owner = await as("owner", MAY);
    const { id } = await owner.client.receivables.writeOff({
      source: "sale",
      id: saleId,
      amountMoney: 5000,
      why: "পালিয়ে গেছে",
    });
    expect(await changesKeptFor(id)).toEqual([
      {
        month: "2071-04",
        source: "receivable_write_off",
        change: "entered",
        about: SHOP,
        tagNumber,
        beforeMoney: null,
        afterMoney: 5000,
      },
    ]);
    await owner.client.receivables.correctWriteOff({
      id,
      reason: "আরও কম পাওয়া যাবে",
      changes: { amountMoney: { from: 5000, to: 8000 } },
    });
    expect(await changesKeptFor(id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          change: "corrected",
          beforeMoney: 5000,
          afterMoney: 8000,
        }),
      ])
    );
  });
});

describe("a Cash Count in a closed month", () => {
  it("is refused to the Manager counting it again", async () => {
    const manager = await as("manager", MAY);
    await expect(
      correctStepAsShown(manager.client, {
        completionId,
        reason: "আবার গুনে দেখি",
        evidence: [200, ""],
      })
    ).rejects.toMatchObject(MONTH_CLOSED);
  });

  it("is the Owner's to count again, and is listed", async () => {
    const owner = await as("owner", MAY);
    await correctStepAsShown(owner.client, {
      completionId,
      reason: "আবার গুনে দেখা গেল",
      evidence: [300, ""],
    });
    const count = await scratchDb().query.cashCount.findFirst({
      where: { completionId },
      columns: { id: true },
    });
    expect(await changesKeptFor(count?.id ?? "")).toEqual([
      expect.objectContaining({
        month: "2071-04",
        source: "cash_count",
        change: "corrected",
        beforeMoney: 0,
        afterMoney: 300,
      }),
    ]);
  });
});

describe("a Bank Check of a closed month", () => {
  it("is the Owner's, and is listed", async () => {
    const owner = await as("owner", MAY);
    await owner.client.farmAccounts.check({
      id: accountId,
      month: "2071-04",
      readMoney: 0,
    });
    const listed = await scratchDb().query.closedMonthChange.findMany({
      where: { source: "bank_check", month: "2071-04" },
      columns: { change: true, afterMoney: true, about: true },
    });
    expect(listed).toEqual([
      { change: "entered", afterMoney: 0, about: `বিকাশ ${suffix}` },
    ]);
  });
});

describe("what changed, said", () => {
  it("names each record on the screen: its kind, whom it was with, its tag and where to find it", async () => {
    const owner = await as("owner", MAY);
    const may = await owner.client.monthlyReport.month({ month: "2071-05" });
    const writeOff = may.changedAfterClosing?.find(
      (one) => one.source === "receivable_write_off"
    );
    expect(writeOff).toMatchObject({
      recordWord: "months.closing.from.receivableWriteOff",
      about: SHOP,
      tagNumber,
    });
  });

  it("is in the accountant's CSV of the month it was changed in, with the record it was", async () => {
    const owner = await as("owner", MAY);
    const { csv } = await owner.client.monthlyReport.monthCsv({
      month: "2071-05",
    });
    const lines = csv.split(/\r?\n/u);
    const changed = lines.filter((line) =>
      line.includes("Changed after closing")
    );
    expect(changed.length).toBeGreaterThanOrEqual(4);
    expect(changed.some((line) => line.includes(SHOP))).toBe(true);
    expect(
      changed.some((line) => line.includes("Receivable written off"))
    ).toBe(true);
    expect(changed.some((line) => line.includes(tagNumber))).toBe(true);
  });

  it("is on the paper of the month it was changed in, with the record it was", async () => {
    const owner = await as("owner", MAY);
    const { document } = await owner.client.monthlyReport.monthPaper({
      month: "2071-05",
    });
    const en = paperText(document, "en");
    expect(en).toContain("Cash handover");
    expect(en).toContain("Receivable written off");
    expect(en).toContain(SHOP);
    expect(en).toContain(tagNumber);
    const bn = paperText(document, "bn");
    expect(bn).toContain("বাকি বাদ দেওয়া");
  });
});

describe("a Correction and a month closing at once", () => {
  it("neither waits on the other for ever: each is done, or refused in the farm's own words", async () => {
    const owner = await as("owner", MAY);
    const categories = await owner.client.money.categories.list();
    const repairsId = categories.find((one) => one.key === "repairs")?.id ?? "";
    const bill = await owner.client.money.enter({
      categoryId: repairsId,
      amountMoney: 400,
      occurredOn: "2071-03-12",
      counterparty: { name: `মিস্ত্রি ${suffix}` },
    });
    const results = await Promise.allSettled([
      owner.client.money.correctEntered({
        id: bill.id,
        changes: { amountMoney: { from: 400, to: 450 } },
        reason: "বিল ভুল",
      }),
      owner.client.monthlyReport.close({ month: "2071-03" }),
    ]);
    const failed = results.flatMap((one) =>
      one.status === "rejected" ? [one.reason as { message?: string }] : []
    );
    expect(failed.map((one) => one.message ?? "")).not.toContainEqual(
      expect.stringMatching(/deadlock/iu)
    );
    expect(results.map((one) => one.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
  });
});

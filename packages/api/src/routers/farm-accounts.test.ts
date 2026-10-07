import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The Farm's own mobile money numbers and bank accounts — its **Farm Accounts** — are listed by the Owner. Once a kind is
 * listed, money by it names which one it went into or came out of, and its transaction ID: a Manager can no longer
 * write cash as mobile money with nothing to read it against.
 */
const suffix = `accounts-${Date.now()}`;
const DAY = "2082-04-05";

const as = (
  role: "owner" | "manager" | "vet",
  instant = `${DAY}T10:00:00.000Z`
) => createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let manureId = "";
const accounts = { office: "", spare: "", bank: "" };

/** Manure sold for ৳amount, by mobile money or the bank, written by the Manager. */
const manureSold = async (
  amountMoney: number,
  sheet: {
    paymentMethod: "cash" | "mobile_money" | "bank";
    farmAccountId?: string;
    reference?: string;
  }
) => {
  const manager = await as("manager");
  return await manager.client.money.enter({
    categoryId: manureId,
    amountMoney,
    occurredOn: DAY,
    counterparty: { name: `ক্রেতা ${suffix}` },
    note: `গোবর ${amountMoney} ${suffix}`,
    ...sheet,
  });
};

const theEvent = async (id: string) => {
  const owner = await as("owner");
  const list = await owner.client.money.list({ from: DAY, to: DAY });
  return list.events.find((one) => one.id === id);
};

beforeAll(async () => {
  const owner = await as("owner", `${DAY}T03:00:00.000Z`);
  await as("manager", `${DAY}T03:00:00.000Z`);
  await as("vet", `${DAY}T03:00:00.000Z`);
  const categories = await owner.client.money.categories.list();
  manureId = categories.find((one) => one.key === "manure_sales")?.id ?? "";
  const office = await owner.client.farmAccounts.create({
    kind: "mobile_money",
    name: `অফিস বিকাশ ${suffix}`,
    number: "01711000001",
  });
  accounts.office = office.id;
  const spare = await owner.client.farmAccounts.create({
    kind: "mobile_money",
    name: `দ্বিতীয় বিকাশ ${suffix}`,
    number: "01711000002",
  });
  accounts.spare = spare.id;
  const bank = await owner.client.farmAccounts.create({
    kind: "bank",
    name: `সোনালী চলতি ${suffix}`,
    number: "0123456789",
    bank: "সোনালী ব্যাংক",
    branch: "সাভার",
  });
  accounts.bank = bank.id;
});

describe("the Farm Accounts", () => {
  it("are the Owner's to list; a Manager reads them, the number masked", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.farmAccounts.create({
        kind: "mobile_money",
        name: `ম্যানেজারের বিকাশ ${suffix}`,
        number: "01711000009",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const listed = await manager.client.farmAccounts.list();
    const office = listed.find((one) => one.id === accounts.office);
    expect(office?.number).toBe("•••••••0001");
  });

  it("are named, with the transaction ID, on mobile money money", async () => {
    const { id } = await manureSold(2000, {
      paymentMethod: "mobile_money",
      farmAccountId: accounts.office,
      reference: `TRX-A-${suffix}`,
    });
    expect(await theEvent(id)).toMatchObject({
      farmAccountId: accounts.office,
      reference: `TRX-A-${suffix}`,
    });
    // And on the accountant's export, which is what they read against the statement: the transaction ID and the
    // account, as the register shows them.
    const owner = await as("owner");
    await owner.client.farm.setIdentity({
      address: `সাভার, ঢাকা ${suffix}`,
      phone: "+8801711000094",
      registrationNumber: `DLS/SAV/2082/${suffix}`,
      registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
      registrationExpiresOn: "2085-03-31",
    });
    const registered = await as("owner");
    const { csv } = await registered.client.reports.accountantExport({
      from: DAY,
      to: DAY,
      format: "csv",
    });
    const [header, ...rows] = (csv ?? "").slice(1).trim().split("\r\n");
    expect(header).toContain("transaction_id,farm_account");
    expect(rows.find((row) => row.includes(id))).toContain(
      `TRX-A-${suffix},অফিস বিকাশ ${suffix}`
    );
  });

  it("refuses mobile money money that names no account, the bank's, or one with no transaction ID", async () => {
    await expect(
      manureSold(1000, {
        paymentMethod: "mobile_money",
        reference: `TRX-B-${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "names_no_farm_account" } });
    await expect(
      manureSold(1000, {
        paymentMethod: "mobile_money",
        farmAccountId: accounts.bank,
        reference: `TRX-C-${suffix}`,
      })
    ).rejects.toMatchObject({
      data: { refusal: "farm_account_not_that_kind" },
    });
    await expect(
      manureSold(1000, {
        paymentMethod: "mobile_money",
        farmAccountId: accounts.office,
      })
    ).rejects.toMatchObject({ data: { refusal: "needs_its_reference" } });
    await expect(
      manureSold(1000, {
        paymentMethod: "mobile_money",
        farmAccountId: `no-such-account-${suffix}`,
        reference: `TRX-B-${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "names_no_farm_account" } });
  });

  it("takes a transaction ID once on one account, and again on another", async () => {
    await expect(
      manureSold(1500, {
        paymentMethod: "mobile_money",
        farmAccountId: accounts.office,
        reference: `TRX-A-${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "reference_used_already" } });
    // Typed in small letters, the same transaction all the same: a message read off a phone is not case-sensitive.
    await expect(
      manureSold(1500, {
        paymentMethod: "mobile_money",
        farmAccountId: accounts.office,
        reference: `trx-a-${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "reference_used_already" } });
    await expect(
      manureSold(1500, {
        paymentMethod: "mobile_money",
        farmAccountId: accounts.spare,
        reference: `TRX-A-${suffix}`,
      })
    ).resolves.toBeDefined();
  });

  it("refuses a retired account, and names none on cash", async () => {
    const owner = await as("owner");
    await owner.client.farmAccounts.retire({ id: accounts.spare });
    await expect(
      manureSold(700, {
        paymentMethod: "mobile_money",
        farmAccountId: accounts.spare,
        reference: `TRX-D-${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "farm_account_retired" } });
    const { id } = await manureSold(700, {
      paymentMethod: "cash",
      farmAccountId: accounts.office,
      reference: `TRX-E-${suffix}`,
    });
    expect(await theEvent(id)).toMatchObject({
      farmAccountId: null,
      reference: null,
    });
  });

  it("are named on a Receivable Payment by mobile money, number and TrxID kept", async () => {
    const owner = await as("owner", `${DAY}T07:00:00.000Z`);
    const shed = await owner.client.sheds.create({ name: suffix });
    const pen = await owner.client.sheds.pens.create({
      quarantine: true,
      shedId: shed.id,
      name: `ফ্যাটেনিং ${suffix}`,
    });
    const bull = await owner.client.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 50_000,
      weightKg: 250,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(`${DAY}T04:00:00.000Z`),
      paymentMethod: "cash",
    });
    await owner.client.sales.record({
      tagNumber: bull.tagNumber,
      buyer: { name: `বাকির ক্রেতা ${suffix}` },
      priceMoney: 80_000,
      weightKg: 300,
      destination: `হাট ${suffix}`,
      vehicle: `ট্রাক ${suffix}`,
      driver: `চালক ${suffix}`,
      soldAt: new Date(`${DAY}T06:00:00.000Z`),
      paymentMethod: "cash",
      paidNowMoney: 30_000,
      promisedBy: "2082-04-20",
    });
    const later = await as("owner", `${DAY}T08:00:00.000Z`);
    const { id } = await later.client.receivables.pay({
      buyer: `বাকির ক্রেতা ${suffix}`,
      kind: "cattle",
      amountMoney: 20_000,
      paidOn: DAY,
      paymentMethod: "mobile_money",
      farmAccountId: accounts.office,
      reference: `TRX-RECEIVABLE-${suffix}`,
    });
    const owner2 = await as("owner");
    const list = await owner2.client.money.list({ from: DAY, to: DAY });
    expect(
      list.events.find(
        (one) => one.source === "receivable_payment" && one.sourceId === id
      )
    ).toMatchObject({
      farmAccountId: accounts.office,
      reference: `TRX-RECEIVABLE-${suffix}`,
    });
  });

  it("are named on the Vet's fee by mobile money", async () => {
    const vet = await as("vet");
    await vet.client.money.vetFee({
      amountMoney: 1500,
      visitedOn: DAY,
      paymentMethod: "mobile_money",
      farmAccountId: accounts.office,
      reference: `TRX-VET-${suffix}`,
    });
    const owner = await as("owner");
    const list = await owner.client.money.list({ from: DAY, to: DAY });
    expect(
      list.events.find((one) => one.reference === `TRX-VET-${suffix}`)
    ).toMatchObject({ source: "vet_fee", farmAccountId: accounts.office });
  });

  it("are dropped by a Correction to cash", async () => {
    const { id } = await manureSold(800, {
      paymentMethod: "mobile_money",
      farmAccountId: accounts.office,
      reference: `TRX-CASH-${suffix}`,
    });
    const manager = await as("manager", `${DAY}T11:00:00.000Z`);
    await manager.client.money.correctEntered({
      id,
      reason: `নগদে দিয়েছিল ${suffix}`,
      changes: { paymentMethod: { from: "mobile_money", to: "cash" } },
    });
    expect(await theEvent(id)).toMatchObject({
      paymentMethod: "cash",
      farmAccountId: null,
      reference: null,
    });
  });

  it("is put right by a Correction, and a TRX taken there is refused", async () => {
    const { id } = await manureSold(900, {
      paymentMethod: "mobile_money",
      farmAccountId: accounts.office,
      reference: `TRX-G-${suffix}`,
    });
    const manager = await as("manager", `${DAY}T11:00:00.000Z`);
    // Written against the wrong transaction: the one the mobile money message really said.
    await manager.client.money.correctEntered({
      id,
      reason: `ভুল ট্রানজ্যাকশন আইডি ${suffix}`,
      changes: {
        farmAccount: {
          from: {
            farmAccountId: accounts.office,
            reference: `TRX-G-${suffix}`,
          },
          to: { farmAccountId: accounts.office, reference: `TRX-H-${suffix}` },
        },
      },
    });
    expect(await theEvent(id)).toMatchObject({ reference: `TRX-H-${suffix}` });
    await expect(
      manager.client.money.correctEntered({
        id,
        reason: `আবার ${suffix}`,
        changes: {
          farmAccount: {
            from: {
              farmAccountId: accounts.office,
              reference: `TRX-H-${suffix}`,
            },
            to: {
              farmAccountId: accounts.office,
              reference: `TRX-A-${suffix}`,
            },
          },
        },
      })
    ).rejects.toMatchObject({ data: { refusal: "reference_used_already" } });
  });

  it("puts a Wage Draw right from cash to mobile money only with the account and its transaction ID", async () => {
    const manager = await as("manager", `${DAY}T11:00:00.000Z`);
    const drawn = await manager.client.money.drawWage({
      counterparty: { name: `রাখাল ${suffix}` },
      amountMoney: 1500,
      drawnOn: DAY,
    });
    const change = {
      paymentMethod: { from: "cash" as const, to: "mobile_money" as const },
    };
    // Named nothing, it is refused: a farm that lists its mobile money numbers asks which one.
    await expect(
      manager.client.money.correctDraw({
        id: drawn.id,
        reason: `বিকাশে দিয়েছিল ${suffix}`,
        changes: change,
      })
    ).rejects.toMatchObject({ data: { refusal: "names_no_farm_account" } });
    await manager.client.money.correctDraw({
      id: drawn.id,
      reason: `বিকাশে দিয়েছিল ${suffix}`,
      changes: {
        ...change,
        farmAccount: {
          from: { farmAccountId: null, reference: null },
          to: { farmAccountId: accounts.office, reference: `TRX-D-${suffix}` },
        },
      },
    });
    const owner = await as("owner");
    const list = await owner.client.money.list({ from: DAY, to: DAY });
    expect(list.events.find((one) => one.sourceId === drawn.id)).toMatchObject({
      paymentMethod: "mobile_money",
      farmAccountId: accounts.office,
      reference: `TRX-D-${suffix}`,
    });
  });

  it("takes cash into the bank account, and mobile money to the bank, as Handovers", async () => {
    const owner = await as("owner");
    await owner.client.cash.handOver({
      from: { userId: thePerson("owner").id },
      to: { farmAccountId: accounts.bank },
      amountMoney: 5000,
      reference: `SLIP-${suffix}`,
    });
    await owner.client.cash.handOver({
      from: { farmAccountId: accounts.office },
      to: { farmAccountId: accounts.bank },
      amountMoney: 2000,
      reference: `TRX-F-${suffix}`,
    });
    await expect(
      owner.client.cash.handOver({
        from: { farmAccountId: accounts.bank },
        to: { farmAccountId: accounts.bank },
        amountMoney: 100,
        reference: `X-${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "handover_goes_nowhere" } });
    // The bank unnamed, while the farm has a bank account open to name.
    await expect(
      owner.client.cash.handOver({
        from: { userId: thePerson("owner").id },
        to: { bank: true },
        amountMoney: 100,
        reference: `SLIP-U-${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "names_no_farm_account" } });
  });

  it("are asked for no longer once every one of a kind is retired", async () => {
    const owner = await as("owner");
    await owner.client.farmAccounts.retire({ id: accounts.bank });
    // The farm's only bank account closed: bank money is still written, naming none rather than refused for ever.
    const { id } = await manureSold(3000, { paymentMethod: "bank" });
    expect(await theEvent(id)).toMatchObject({ farmAccountId: null });
    // And no cash is deposited into it.
    await expect(
      owner.client.cash.handOver({
        from: { userId: thePerson("owner").id },
        to: { farmAccountId: accounts.bank },
        amountMoney: 500,
        reference: `SLIP-2-${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "farm_account_retired" } });
    await expect(
      owner.client.cash.handOver({
        from: { userId: thePerson("owner").id },
        to: { bank: true },
        amountMoney: 500,
        reference: `SLIP-3-${suffix}`,
      })
    ).resolves.toBeDefined();
  });
});

describe("one number, however it is written", () => {
  it("is listed once, in English digits, whether typed in Bangla digits or with a dash", async () => {
    const owner = await as("owner");
    const { id } = await owner.client.farmAccounts.create({
      kind: "mobile_money",
      name: `নগদ ${suffix}`,
      number: "০১৭৮৮-০০০৩৩৩",
    });
    for (const again of ["01788000333", "01788 000 333"]) {
      // oxlint-disable-next-line no-await-in-loop -- one spelling after another
      await expect(
        owner.client.farmAccounts.create({
          kind: "mobile_money",
          name: `আবার ${suffix}`,
          number: again,
        })
      ).rejects.toMatchObject({
        data: { refusal: "farm_account_listed_already", id },
      });
    }
    const listed = await owner.client.farmAccounts.list();
    expect(listed.find((one) => one.id === id)?.number).toBe("01788000333");
  });

  it("is brought back when retired by mistake, and listing it again says so", async () => {
    const owner = await as("owner");
    const { id } = await owner.client.farmAccounts.create({
      kind: "mobile_money",
      name: `ভুলে বাদ ${suffix}`,
      number: "01799000444",
    });
    await owner.client.farmAccounts.retire({ id });
    await expect(
      owner.client.farmAccounts.create({
        kind: "mobile_money",
        name: `আবার ${suffix}`,
        number: "01799000444",
      })
    ).rejects.toMatchObject({
      data: { refusal: "farm_account_retired_already", id },
    });
    await owner.client.farmAccounts.bringBack({ id });
    const listed = await owner.client.farmAccounts.list();
    expect(listed.find((one) => one.id === id)?.retired).toBe(false);
    const manager = await as("manager");
    await expect(
      manager.client.farmAccounts.bringBack({ id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps the day it was first retired when retired again, and finds no account the farm does not have", async () => {
    const owner = await as("owner", "2066-01-10T04:00:00.000Z");
    const { id } = await owner.client.farmAccounts.create({
      kind: "mobile_money",
      name: `দুবার বাদ ${suffix}`,
      number: "01799000555",
    });
    await owner.client.farmAccounts.retire({ id });
    const later = await as("owner", "2066-03-10T04:00:00.000Z");
    await later.client.farmAccounts.retire({ id });
    const kept = await scratchDb().query.farmAccount.findFirst({
      where: { id },
      columns: { retiredAt: true },
    });
    expect(kept?.retiredAt).toEqual(new Date("2066-01-10T04:00:00.000Z"));
    await expect(
      later.client.farmAccounts.retire({ id: "not-the-farms" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

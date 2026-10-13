import { uuidv7 } from "@OpenFarm/db/ids";
import { paperText } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// What the Farm owed its Suppliers at a month's end (E4 of the flow survey of 2026-10-13; ADR 0023, 0026).
//
// On 2 May a Supplier brings ৳40,000 of concentrate on his bill, due by the 20th; ৳10,000 is paid at the gate. On 28 May
// a second bill brings ৳8,000 more, due 27 June, nothing paid. On 5 June the Owner pays ৳20,000 on the first bill —
// which May's end knows nothing of. So May ends owing ৳38,000: ৳30,000 on a bill 29 days old and past its day, ৳8,000
// on one 3 days old and not yet due. June ends owing ৳18,000.

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const MAY = "2046-05";
const LATER = "2046-07-10T04:00:00.000Z";
let feedItemId: string;
const supplier = {
  id: uuidv7(),
  name: `ফিড হাউস ${uuidv7()}`,
  phone: "01711111111",
  address: "সাভার",
  contactPerson: "বিক্রয়",
  creditDays: 18,
};

const bring = async (
  day: string,
  priceMoney: number,
  paidAtDeliveryMoney: number,
  dueOn: string
) => {
  const { client } = await as("manager", `${day}T04:00:00.000Z`);
  const id = uuidv7();
  await client.stock.receive({
    id,
    feedItemId,
    kind: "purchase",
    quantity: 1000,
    priceMoney,
    seller: { name: supplier.name },
    supplierId: supplier.id,
    receivedOn: day,
    invoice: { number: `BILL-${id}`, invoicedOn: day, dueOn },
    paidAtDeliveryMoney,
  });
};

beforeAll(async () => {
  const { client } = await as("manager", "2046-05-01T04:00:00.000Z");
  const feed = await client.feed.items.create({
    name: { bn: `দানাদার ${uuidv7()}`, en: "Concentrate" },
  });
  feedItemId = feed.id;
  const identity = await client.farm.identity();
  if (identity.registrationMissing) {
    await client.farm.setIdentity({ registrationNumber: "DLS/SAV/2046/০০১" });
  }
  await client.suppliers.save(supplier);
  await bring("2046-05-02", 40_000, 10_000, "2046-05-20");
  await bring("2046-05-28", 8000, 0, "2046-06-27");
  const owner = await as("owner", "2046-06-05T04:00:00.000Z");
  const { invoices } = await owner.client.suppliers.details({
    id: supplier.id,
  });
  const first = invoices.find((one) => one.invoicedOn === "2046-05-02");
  if (!first) {
    throw new Error("Expected the first bill");
  }
  await owner.client.suppliers.pay({
    id: uuidv7(),
    invoiceId: first.id,
    amountMoney: 20_000,
    paidOn: "2046-06-05",
    paymentMethod: "cash",
  });
});

describe("what the Farm owed its Suppliers at a month's end", () => {
  it("is each bill's feed less what was paid by then, by the days since its date, with what was past its day", async () => {
    const { client } = await as("owner", LATER);
    const { figures } = await client.monthlyReport.month({ month: MAY });

    expect(figures.atEnd.owedToSuppliers).toEqual({
      owingMoney: 38_000,
      overdueMoney: 30_000,
      ages: [
        { age: "0-7", owingMoney: 8000 },
        { age: "8-15", owingMoney: 0 },
        { age: "16-30", owingMoney: 30_000 },
        { age: "31-60", owingMoney: 0 },
        { age: "over-60", owingMoney: 0 },
      ],
    });
  });

  it("counts a payment made after the month's end only in the month it was made", async () => {
    const { client } = await as("owner", LATER);
    const { figures } = await client.monthlyReport.month({ month: "2046-06" });

    expect(figures.atEnd.owedToSuppliers.owingMoney).toBe(18_000);
  });

  it("takes what was owed off the capital the Farm had tied up: that feed was not yet its own money", async () => {
    const { client } = await as("owner", LATER);
    const { figures } = await client.monthlyReport.month({ month: MAY });
    const { capital } = figures.atEnd;

    expect(capital.owedToSuppliersMoney).toBe(38_000);
    expect(capital.totalMoney).toBe(
      capital.dairyMoney +
        capital.fatteningMoney +
        capital.venturesMoney +
        capital.storeMoney +
        capital.receivablesMoney -
        38_000
    );
  });

  it("names on the accountant's summary each Supplier the Farm still owed at the period's end", async () => {
    const { client } = await as("owner", LATER);
    const { document } = await client.reports.accountantExport({
      from: "2046-05-01",
      to: "2046-05-31",
      format: "paper",
    });
    const said = document ? paperText(document, "en") : "";

    expect(said).toContain("Owed to suppliers at the period's end");
    expect(said).toContain(supplier.name);
  });
});

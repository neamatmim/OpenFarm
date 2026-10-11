import { uuidv7 } from "@OpenFarm/db/ids";
import { farm as farmTable } from "@OpenFarm/db/schema/farm";
import { counterparty } from "@OpenFarm/db/schema/fattening";
import { feedIn } from "@OpenFarm/db/schema/feed";
import { supplierInvoice, supplierProfile } from "@OpenFarm/db/schema/supplier";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const NOW = "2070-02-20T05:00:00.000Z";
const as = (role: "owner" | "manager" | "staff" | "vet" | null, shed = false) =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(NOW),
    onShedPhone: shed,
  });
let feedItemId: string;
beforeAll(async () => {
  const { client } = await as("manager");
  const feed = await client.feed.items.create({
    name: { bn: `খাদ্য ${uuidv7()}`, en: "Feed" },
  });
  feedItemId = feed.id;
});
const newSupplier = async () => {
  const manager = await as("manager");
  const input = {
    id: uuidv7(),
    name: `Supplier ${uuidv7()}`,
    phone: "01711111111",
    address: "Dhaka",
    contactPerson: "Sales desk",
    creditDays: 30,
  };
  await manager.client.suppliers.save(input);
  return { ...manager, input };
};
const receipt = (supplier: { id: string; name: string }, overrides = {}) => ({
  id: uuidv7(),
  feedItemId,
  kind: "purchase" as const,
  quantity: 100,
  priceMoney: 20_000,
  seller: { name: supplier.name },
  supplierId: supplier.id,
  receivedOn: "2070-02-01",
  invoice: {
    number: `INV-${uuidv7()}`,
    invoicedOn: "2070-02-01",
    dueOn: "2070-02-15",
  },
  paidAtDeliveryMoney: 5000,
  ...overrides,
});
const bought = async (paidAtDeliveryMoney = 5000) => {
  const supplier = await newSupplier();
  const input = receipt(supplier.input, { paidAtDeliveryMoney });
  await supplier.client.stock.receive(input);
  const details = await supplier.client.suppliers.details({
    id: supplier.input.id,
  });
  const [invoice] = details.invoices;
  if (!invoice) {
    throw new Error("Expected the supplier invoice");
  }
  return { ...supplier, delivery: input, invoice };
};
const payInput = (invoiceId: string, amountMoney: number) => ({
  id: uuidv7(),
  invoiceId,
  amountMoney,
  paidOn: "2070-02-20",
  paymentMethod: "cash" as const,
});

describe("suppliers, invoices and payments", () => {
  it("plans open invoices from actual balances, keeps retired suppliers and refreshes after payments are voided", async () => {
    const { client, input, invoice } = await bought();
    await client.stock.receive(
      receipt(input, {
        receivedOn: "2070-02-04",
        quantity: 50,
        priceMoney: 10_000,
        paidAtDeliveryMoney: 0,
        invoice: {
          number: invoice.number,
          invoicedOn: invoice.invoicedOn,
          dueOn: invoice.dueOn,
        },
      })
    );
    await client.stock.receive(
      receipt(input, {
        invoice: {
          number: "UPCOMING",
          invoicedOn: "2070-02-01",
          dueOn: "2070-02-25",
        },
      })
    );
    await client.stock.receive(
      receipt(input, {
        paidAtDeliveryMoney: 20_000,
        invoice: {
          number: "PAID",
          invoicedOn: "2070-02-01",
          dueOn: "2070-02-20",
        },
      })
    );
    const owner = await as("owner");
    const payment = payInput(invoice.id, 1000);
    await owner.client.suppliers.pay(payment);
    await owner.client.suppliers.save({
      ...input,
      version: 1,
      retired: true,
      reason: "No further orders",
    });
    const plan = await client.suppliers.paymentPlan();
    expect(plan).toMatchObject({
      today: "2070-02-20",
      through7: "2070-02-26",
      through30: "2070-03-21",
      monthEnd: "2070-02-28",
    });
    const group = plan.suppliers.find((row) => row.supplier.id === input.id);
    expect(group).toMatchObject({
      supplier: {
        id: input.id,
        name: input.name,
        phone: input.phone,
        retired: true,
      },
      outstandingMoney: 39_000,
      overdueMoney: 24_000,
      next7Money: 15_000,
      next30Money: 15_000,
      byMonthEndMoney: 39_000,
    });
    expect(group?.invoices.map((row) => row.number)).toEqual([
      invoice.number,
      "UPCOMING",
    ]);
    expect(group?.invoices[0]).toEqual({
      id: invoice.id,
      number: invoice.number,
      invoicedOn: invoice.invoicedOn,
      dueOn: invoice.dueOn,
      purchasedMoney: 30_000,
      paidMoney: 6000,
      owingMoney: 24_000,
      supplier: {
        id: input.id,
        name: input.name,
        phone: input.phone,
        retired: true,
      },
    });
    expect(await client.suppliers.invoice({ id: invoice.id })).toMatchObject({
      owingMoney: 24_000,
      payments: [expect.objectContaining({ id: payment.id })],
    });
    await owner.client.suppliers.correctPayment({
      id: payment.id,
      reason: "Payment was not made",
      changes: { voided: { from: false, to: true } },
    });
    const after = await client.suppliers.paymentPlan();
    expect(
      after.suppliers.find((row) => row.supplier.id === input.id)
    ).toMatchObject({
      outstandingMoney: 40_000,
      overdueMoney: 25_000,
      byMonthEndMoney: 40_000,
    });
  });
  it("offers only the chosen supplier's invoice headers with the balance of all deliveries and payments", async () => {
    const { client, input, invoice } = await bought();
    const owner = await as("owner");
    await owner.client.suppliers.pay(payInput(invoice.id, 1000));
    await client.stock.receive(
      receipt(input, {
        invoice: {
          number: invoice.number,
          invoicedOn: invoice.invoicedOn,
          dueOn: invoice.dueOn,
        },
        receivedOn: "2070-02-04",
        quantity: 50,
        priceMoney: 10_000,
        paidAtDeliveryMoney: 0,
      })
    );
    const choices = await client.suppliers.invoices({ supplierId: input.id });
    expect(choices).toEqual([
      {
        id: invoice.id,
        number: invoice.number,
        invoicedOn: invoice.invoicedOn,
        dueOn: invoice.dueOn,
        purchasedMoney: 30_000,
        paidMoney: 6000,
        owingMoney: 24_000,
      },
    ]);
    const other = await newSupplier();
    expect(
      await client.suppliers.invoices({ supplierId: other.input.id })
    ).toEqual([]);
  });

  it("protects invoice choices by role and farm ownership", async () => {
    const { client, context, input } = await newSupplier();
    await Promise.all(
      (["staff", "vet", null] as const).map(async (role) => {
        const caller = await as(role);
        await expect(
          caller.client.suppliers.invoices({ supplierId: input.id })
        ).rejects.toBeDefined();
        await expect(
          caller.client.suppliers.paymentPlan()
        ).rejects.toBeDefined();
        await expect(
          caller.client.suppliers.invoice({ id: uuidv7() })
        ).rejects.toBeDefined();
      })
    );
    const farm = await context.db.query.farm.findFirst({
      where: { id: context.farm?.id },
    });
    const vendor = await context.db.query.counterparty.findFirst({
      where: { id: input.id },
    });
    if (!farm || !vendor) {
      throw new Error("Expected supplier fixtures");
    }
    const foreignFarmId = uuidv7();
    const foreignSupplierId = uuidv7();
    await context.db.insert(farmTable).values({ ...farm, id: foreignFarmId });
    await context.db
      .insert(counterparty)
      .values({ ...vendor, id: foreignSupplierId, farmId: foreignFarmId });
    await context.db.insert(supplierProfile).values({
      counterpartyId: foreignSupplierId,
      farmId: foreignFarmId,
      createdAt: new Date(NOW),
    });
    const delivered = receipt(input);
    await client.stock.receive(delivered);
    const [localInvoice] = await client.suppliers.invoices({
      supplierId: input.id,
    });
    const localDelivery = await context.db.query.feedIn.findFirst({
      where: { id: delivered.id },
    });
    if (!localInvoice || !localDelivery) {
      throw new Error("Expected invoice and delivery fixtures");
    }
    const foreignInvoiceId = uuidv7();
    await context.db.insert(supplierInvoice).values({
      id: foreignInvoiceId,
      farmId: foreignFarmId,
      counterpartyId: foreignSupplierId,
      number: "FOREIGN",
      invoicedOn: "2070-02-01",
      dueOn: "2070-02-15",
      recordedAt: new Date(NOW),
    });
    await context.db.insert(feedIn).values({
      ...localDelivery,
      id: uuidv7(),
      farmId: foreignFarmId,
      counterpartyId: foreignSupplierId,
      supplierInvoiceId: foreignInvoiceId,
    });
    const plan = await client.suppliers.paymentPlan();
    expect(
      plan.suppliers.some((group) => group.supplier.id === foreignSupplierId)
    ).toBe(false);
    expect(
      plan.suppliers
        .flatMap((group) => group.invoices)
        .some((row) => row.id === foreignInvoiceId)
    ).toBe(false);
    await expect(
      client.suppliers.invoice({ id: foreignInvoiceId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      client.suppliers.invoice({ id: uuidv7() })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      client.suppliers.invoices({ supplierId: foreignSupplierId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      client.suppliers.invoices({ supplierId: uuidv7() })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("prints only approved purchase orders with the supplier terms captured at request time", async () => {
    const { client, input, context } = await newSupplier();
    const id = uuidv7();
    const assignedTo = context.actor?.id;
    if (!assignedTo) {
      throw new Error("Expected a manager");
    }
    const terms = { quantity: 100, unitPriceMoney: 40, budgetMoney: 4000 };
    await client.feedPurchasing.request({
      id,
      feedItemId,
      supplierId: input.id,
      supplier: { name: input.name },
      assignedTo,
      ...terms,
      neededOn: "2070-03-01",
      leadDays: 3,
      bufferDays: 2,
    });
    await expect(client.feedPurchasing.paper({ id })).rejects.toMatchObject({
      data: { refusal: "feed_order_needs_approval" },
    });
    await client.suppliers.save({
      ...input,
      version: 1,
      creditDays: 45,
      reason: "Terms for future orders",
    });
    const owner = await as("owner");
    await owner.client.feedPurchasing.approve({ id, version: 1, ...terms });
    const { document } = await client.feedPurchasing.paper({ id });
    expect(document.title.en).toBe("Feed purchase order");
    expect(document.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "facts",
          rows: expect.arrayContaining([
            expect.objectContaining({
              label: { bn: "বাকির মেয়াদ (দিন)", en: "Credit terms (days)" },
              value: { bn: "30", en: "30" },
            }),
          ]),
        }),
      ])
    );
    const ownerProfile = await owner.client.suppliers.details({ id: input.id });
    await expect(
      owner.client.suppliers.save({
        ...input,
        version: ownerProfile.supplier.version,
        retired: true,
        reason: "Stop using supplier",
      })
    ).rejects.toMatchObject({ data: { refusal: "supplier_open_orders" } });
  });
  it("keeps bank references on vouchers and prevents recording the same transfer twice", async () => {
    const { invoice, input } = await bought();
    const owner = await as("owner");
    const account = await owner.client.farmAccounts.create({
      kind: "bank",
      name: `Bank ${uuidv7()}`,
      number: uuidv7(),
    });
    const payment = {
      ...payInput(invoice.id, 1000),
      paymentMethod: "bank" as const,
      farmAccountId: account.id,
      reference: `transfer-${uuidv7()}`,
    };
    await owner.client.suppliers.pay(payment);
    await expect(
      owner.client.suppliers.pay({
        ...payment,
        id: uuidv7(),
        reference: payment.reference.toUpperCase(),
      })
    ).rejects.toBeDefined();
    const details = await owner.client.suppliers.details({ id: input.id });
    expect(details.invoices[0]?.payments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: payment.id,
          reference: payment.reference,
          paymentMethod: "bank",
        }),
      ])
    );
    const voucher = await owner.client.suppliers.paper({
      supplierId: input.id,
      paymentId: payment.id,
    });
    expect(voucher.document.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "facts",
          rows: expect.arrayContaining([
            expect.objectContaining({
              value: { bn: payment.reference, en: payment.reference },
            }),
          ]),
        }),
      ])
    );
  });
  it("prints the payment made at delivery and keeps an invoice image without exposing it to staff", async () => {
    const { client, input, invoice, delivery } = await bought();
    const photo = {
      contentType: "image/png" as const,
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVAAAAABJRU5ErkJggg==",
    };
    await client.suppliers.keepInvoicePhoto({
      invoiceId: invoice.id,
      photo,
      reason: "Original supplier invoice",
    });
    expect(
      await client.suppliers.invoicePhoto({ invoiceId: invoice.id })
    ).toEqual(photo);
    const voucher = await client.suppliers.paper({
      supplierId: input.id,
      paymentId: delivery.id,
    });
    expect(voucher.document.title.en).toBe("Supplier payment voucher");
    const staff = await as("staff");
    await expect(
      staff.client.suppliers.invoicePhoto({ invoiceId: invoice.id })
    ).rejects.toBeDefined();
  });
  it("keeps receipt-payment changes owner-only and supports reasoned correction of a later payment", async () => {
    const { invoice, delivery, client, input } = await bought();
    const owner = await as("owner");
    await expect(
      client.stock.correct({
        id: delivery.id,
        reason: "Change what was paid",
        changes: { paidAtDeliveryMoney: { from: 5000, to: 6000 } },
      })
    ).rejects.toMatchObject({ data: { refusal: "owner_only" } });
    const payment = payInput(invoice.id, 1000);
    await owner.client.suppliers.pay(payment);
    await owner.client.suppliers.correctPayment({
      id: payment.id,
      reason: "Correct payment amount",
      changes: { amountMoney: { from: 1000, to: 1500 } },
    });
    const details = await owner.client.suppliers.details({ id: input.id });
    expect(details.supplier.owingMoney).toBe(13_500);
    await expect(
      owner.client.suppliers.pay({
        ...payInput(invoice.id, 1),
        paidOn: "2070-02-30",
      })
    ).rejects.toMatchObject({ data: { refusal: "supplier_invoice_days" } });
  });
  it("creates an idempotent directory entry, rejects duplicate names and audits versioned edits", async () => {
    const { client, context, input } = await newSupplier();
    await client.suppliers.save(input);
    const snapshot8 = await client.suppliers.list();
    expect(snapshot8.filter((row) => row.id === input.id)).toHaveLength(1);
    expect(
      await context.db.query.auditEvent.findMany({
        where: { entity: "supplier", entityId: input.id, action: "create" },
      })
    ).toHaveLength(1);
    await expect(
      client.suppliers.save({
        ...input,
        id: uuidv7(),
        name: input.name.toLowerCase(),
      })
    ).rejects.toMatchObject({ data: { refusal: "supplier_exists" } });
    await client.suppliers.save({
      ...input,
      version: 1,
      creditDays: 45,
      reason: "New supplier terms",
    });
    await expect(
      client.suppliers.save({ ...input, version: 1, reason: "Stale terms" })
    ).rejects.toMatchObject({ data: { refusal: "supplier_changed" } });
    const snapshot7 = await client.suppliers.details({ id: input.id });
    expect(snapshot7.supplier).toMatchObject({ creditDays: 45, version: 2 });
  });
  it("records 20000 purchased, 5000 cash paid and 15000 owed without reducing feed value", async () => {
    const { client, context, input, invoice, delivery } = await bought();
    expect(invoice).toMatchObject({
      purchasedMoney: 20_000,
      paidMoney: 5000,
      owingMoney: 15_000,
      aging: "1_30",
    });
    const events = await context.db.query.moneyEvent.findMany({
      where: { source: "feed_in", sourceId: delivery.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ amountMoney: 5000, direction: "out" });
    const stock = await client.stock.onHand();
    expect(
      stock.find((row) => row.feedItemId === feedItemId)?.averagePriceMoney
    ).toBe(200);
    const snapshot6 = await client.suppliers.details({ id: input.id });
    expect(snapshot6.supplier).toMatchObject({
      purchasedMoney: 20_000,
      paidMoney: 5000,
      owingMoney: 15_000,
      overdueMoney: 15_000,
    });
  });
  it("unpaid invoices increase stock and costing without producing a cash event", async () => {
    const { context, delivery, invoice } = await bought(0);
    expect(
      await context.db.query.moneyEvent.findMany({
        where: { source: "feed_in", sourceId: delivery.id },
      })
    ).toHaveLength(0);
    expect(invoice).toMatchObject({
      purchasedMoney: 20_000,
      paidMoney: 0,
      owingMoney: 20_000,
    });
  });
  it("keeps a historical-style fully paid receipt in the directory without inventing a bill", async () => {
    const { client, context, input } = await newSupplier();
    const delivered = {
      id: uuidv7(),
      feedItemId,
      kind: "purchase" as const,
      quantity: 10,
      priceMoney: 2000,
      seller: { name: input.name },
      receivedOn: "2070-02-01",
    };
    await client.stock.receive(delivered);
    const snapshot5 = await client.suppliers.details({ id: input.id });
    expect(snapshot5.supplier).toMatchObject({
      purchasedMoney: 2000,
      paidMoney: 2000,
      owingMoney: 0,
    });
    const snapshot4 = await client.suppliers.details({ id: input.id });
    expect(snapshot4.invoices).toHaveLength(0);
    expect(
      await context.db.query.moneyEvent.findFirst({
        where: { source: "feed_in", sourceId: delivered.id },
      })
    ).toMatchObject({ amountMoney: 2000 });
  });
  it("groups several deliveries under one supplier invoice and refuses changing its dates", async () => {
    const { client, input, invoice, delivery } = await bought();
    await client.stock.receive(
      receipt(input, {
        invoice: {
          ...delivery.invoice,
          number: delivery.invoice.number.toLowerCase(),
        },
        quantity: 10,
        priceMoney: 2000,
        paidAtDeliveryMoney: 0,
      })
    );
    const details = await client.suppliers.details({ id: input.id });
    expect(details.invoices).toHaveLength(1);
    expect(details.invoices[0]).toMatchObject({
      id: invoice.id,
      purchasedMoney: 22_000,
      owingMoney: 17_000,
    });
    await expect(
      client.stock.receive(
        receipt(input, {
          invoice: { ...delivery.invoice, dueOn: "2070-02-16" },
        })
      )
    ).rejects.toMatchObject({ data: { refusal: "supplier_invoice_changed" } });
  });
  it("serializes competing partial payments, refuses overpayment and books each actual payment once", async () => {
    const { invoice, context, client, input } = await bought();
    const owner = await as("owner");
    const results = await Promise.allSettled([
      owner.client.suppliers.pay(payInput(invoice.id, 10_000)),
      owner.client.suppliers.pay(payInput(invoice.id, 10_000)),
    ]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    const snapshot3 = await client.suppliers.details({ id: input.id });
    expect(snapshot3.supplier.owingMoney).toBe(5000);
    const payment = payInput(invoice.id, 5000);
    await Promise.all([
      owner.client.suppliers.pay(payment),
      owner.client.suppliers.pay(payment),
    ]);
    const snapshot2 = await client.suppliers.details({ id: input.id });
    expect(snapshot2.supplier.owingMoney).toBe(0);
    expect(
      await context.db.query.moneyEvent.findMany({
        where: { source: "supplier_payment", sourceId: payment.id },
      })
    ).toHaveLength(1);
    expect(
      await context.db.query.auditEvent.findMany({
        where: {
          entity: "supplier_payment",
          entityId: payment.id,
          action: "create",
        },
      })
    ).toHaveLength(1);
  });
  it("refuses future and backdated payments before the goods arrived", async () => {
    const { invoice } = await bought(0);
    const owner = await as("owner");
    await expect(
      owner.client.suppliers.pay({
        ...payInput(invoice.id, 100),
        paidOn: "2070-01-31",
      })
    ).rejects.toMatchObject({ data: { refusal: "supplier_payment_limit" } });
    await expect(
      owner.client.suppliers.pay({
        ...payInput(invoice.id, 100),
        paidOn: "2070-02-21",
      })
    ).rejects.toMatchObject({ data: { refusal: "supplier_invoice_days" } });
  });
  it("prevents paid invoices becoming overpaid through receipt corrections or voids", async () => {
    const { invoice, delivery } = await bought();
    const owner = await as("owner");
    await owner.client.suppliers.pay(payInput(invoice.id, 10_000));
    await expect(
      owner.client.stock.correct({
        id: delivery.id,
        reason: "Correct price",
        changes: { priceMoney: { from: 20_000, to: 14_000 } },
      })
    ).rejects.toMatchObject({ data: { refusal: "supplier_payment_limit" } });
    await expect(
      owner.client.stock.correct({
        id: delivery.id,
        reason: "Duplicate receipt",
        changes: { voided: { from: false, to: true } },
      })
    ).rejects.toMatchObject({ data: { refusal: "supplier_payment_limit" } });
    await expect(
      owner.client.stock.correct({
        id: delivery.id,
        reason: "Move date",
        changes: { receivedOn: { from: "2070-02-01", to: "2070-02-21" } },
      })
    ).rejects.toBeDefined();
  });
  it("voids a mistaken payment with an audit reason and restores invoice and cash balances", async () => {
    const { invoice, input, context } = await bought();
    const owner = await as("owner");
    const payment = payInput(invoice.id, 2000);
    await owner.client.suppliers.pay(payment);
    await owner.client.suppliers.correctPayment({
      id: payment.id,
      reason: "Duplicate transfer entry",
      changes: { voided: { from: false, to: true } },
    });
    const snapshot1 = await owner.client.suppliers.details({ id: input.id });
    expect(snapshot1.supplier.owingMoney).toBe(15_000);
    expect(
      await context.db.query.moneyEvent.findMany({
        where: { source: "supplier_payment", sourceId: payment.id },
      })
    ).toHaveLength(0);
    expect(
      await context.db.query.auditEvent.findFirst({
        where: {
          entity: "supplier_payment",
          entityId: payment.id,
          action: "correct",
        },
      })
    ).toMatchObject({ reason: "Duplicate transfer entry" });
  });
  it("keeps retirement history and allows old dues to be paid", async () => {
    const { input, invoice } = await bought();
    const owner = await as("owner");
    await owner.client.suppliers.save({
      ...input,
      version: 1,
      retired: true,
      reason: "Supplier relationship ended",
    });
    await expect(
      owner.client.stock.receive(receipt(input))
    ).rejects.toMatchObject({ data: { refusal: "supplier_retired" } });
    await owner.client.suppliers.pay(payInput(invoice.id, 15_000));
    const snapshot0 = await owner.client.suppliers.details({ id: input.id });
    expect(snapshot0.supplier).toMatchObject({
      owingMoney: 0,
      purchaseCount: 1,
    });
  });
  it("protects supplier accounts from staff, vets and shared-phone payments", async () => {
    const { invoice, input } = await bought();
    await Promise.all(
      (["staff", "vet", null] as const).map(async (role) => {
        const caller = await as(role);
        await expect(caller.client.suppliers.list()).rejects.toBeDefined();
      })
    );
    const manager = await as("manager");
    await expect(
      manager.client.suppliers.pay(payInput(invoice.id, 100))
    ).rejects.toBeDefined();
    const shedOwner = await as("owner", true);
    await expect(
      shedOwner.client.suppliers.pay(payInput(invoice.id, 100))
    ).rejects.toMatchObject({ data: { refusal: "personal_phone_only" } });
    await expect(
      manager.client.stock.receive(receipt({ ...input, id: uuidv7() }))
    ).rejects.toMatchObject({ data: { refusal: "supplier_missing" } });
  });
  it("prints truthful balance statements and payment vouchers on the farm letterhead", async () => {
    const { input, invoice } = await bought();
    const owner = await as("owner");
    const payment = payInput(invoice.id, 1000);
    await owner.client.suppliers.pay(payment);
    const statement = await owner.client.suppliers.paper({
      supplierId: input.id,
    });
    expect(statement.document.title.en).toBe("Supplier balance statement");
    const voucher = await owner.client.suppliers.paper({
      supplierId: input.id,
      paymentId: payment.id,
    });
    expect(voucher.document.title.en).toBe("Supplier payment voucher");
    expect(voucher.document.sections).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "signatures" })])
    );
  });
});

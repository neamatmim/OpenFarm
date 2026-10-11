import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, sql } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";
import { supplierInvoice, supplierProfile } from "@OpenFarm/db/schema/supplier";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import {
  supplierAging,
  supplierBalance,
  supplierPaymentsFit,
} from "@OpenFarm/domain/supplier-credit";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { counterpartyNamed } from "./counterparty-store";

export const supplierRefused: (refusal: string) => never = (refusal) => {
  throw new ORPCError("BAD_REQUEST", { data: { refusal } });
};
export const lockSupplierFarm = async (tx: Tx, farmId: string) => {
  await tx
    .select({ id: farm.id })
    .from(farm)
    .where(eq(farm.id, farmId))
    .for("update");
};

export const validSupplierDay = (day: string) => {
  const date = startOfFarmDay(day);
  return Number.isFinite(date.getTime()) && farmDayOf(date) === day;
};

/** Called under the farm lock. Supplier roles extend the existing trader identity, preserving every old purchase. */
export const supplierNamed = async (
  tx: Tx,
  farmId: string,
  said: { name: string; address?: string; phone?: string },
  now: Date,
  chosenId?: string
) => {
  let id: string;
  if (chosenId) {
    const chosen = await tx.query.counterparty.findFirst({
      where: { id: chosenId, farmId },
    });
    if (!chosen) {
      supplierRefused("supplier_missing");
    }
    ({ id } = chosen);
  } else {
    id = await counterpartyNamed(tx, farmId, said, now);
  }
  await tx
    .insert(supplierProfile)
    .values({ farmId, counterpartyId: id, createdAt: now })
    .onConflictDoNothing();
  const profile = await tx.query.supplierProfile.findFirst({
    where: { counterpartyId: id, farmId },
  });
  if (profile?.retiredAt) {
    supplierRefused("supplier_retired");
  }
  return id;
};

export const invoiceInputOf = async (
  tx: Tx,
  farmId: string,
  supplierId: string,
  input: { number: string; invoicedOn: string; dueOn: string },
  receivedOn: string,
  actorId: string,
  now: Date
) => {
  if (
    !validSupplierDay(input.invoicedOn) ||
    !validSupplierDay(input.dueOn) ||
    input.invoicedOn > receivedOn ||
    input.dueOn < input.invoicedOn
  ) {
    supplierRefused("supplier_invoice_days");
  }
  const number = input.number.normalize("NFC").trim();
  const [existing] = await tx
    .select()
    .from(supplierInvoice)
    .where(
      and(
        eq(supplierInvoice.farmId, farmId),
        eq(supplierInvoice.counterpartyId, supplierId),
        sql`lower(${supplierInvoice.number}) = lower(${number})`
      )
    );
  if (existing) {
    if (
      existing.invoicedOn !== input.invoicedOn ||
      existing.dueOn !== input.dueOn
    ) {
      supplierRefused("supplier_invoice_changed");
    }
    return { invoice: existing, created: false };
  }
  const [invoice] = await tx
    .insert(supplierInvoice)
    .values({
      id: uuidv7(now),
      farmId,
      counterpartyId: supplierId,
      number,
      invoicedOn: input.invoicedOn,
      dueOn: input.dueOn,
      recordedBy: actorId,
      recordedAt: now,
    })
    .returning();
  if (!invoice) {
    throw new Error("The supplier invoice was not recorded");
  }
  return { invoice, created: true };
};

export const deliveryInvoice = async (
  tx: Tx,
  context: Context,
  input: {
    invoice?: { number: string; invoicedOn: string; dueOn: string };
    priceMoney?: number;
    paidAtDeliveryMoney?: number;
    receivedOn: string;
  },
  sellerId: string | null,
  now: Date
) => {
  if (!input.invoice || !sellerId || !context.actor || !context.farm) {
    return { supplierInvoiceId: null, paidAtDeliveryMoney: null };
  }
  const { invoice, created } = await invoiceInputOf(
    tx,
    context.farm.id,
    sellerId,
    input.invoice,
    input.receivedOn,
    context.actor.id,
    now
  );
  if (created) {
    await audited(context).recordEvent(tx, {
      entity: "supplier_invoice",
      entityId: invoice.id,
      action: "create",
      after: invoice,
    });
  }
  return {
    supplierInvoiceId: invoice.id,
    paidAtDeliveryMoney: input.paidAtDeliveryMoney ?? input.priceMoney ?? 0,
  };
};

export const invoiceDetails = async (
  db: Database | Tx,
  farmId: string,
  id: string,
  now: Date
) => {
  const row = await db.query.supplierInvoice.findFirst({
    where: { id, farmId },
    with: {
      supplier: true,
      deliveries: { orderBy: { receivedOn: "asc", id: "asc" } },
      payments: { orderBy: { paidOn: "asc", id: "asc" } },
      photo: { columns: { updatedAt: true } },
    },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such supplier invoice" });
  }
  const { photo, deliveries, ...invoice } = row;
  const events = await db.query.moneyEvent.findMany({
    where: {
      farmId,
      source: { in: ["feed_in", "supplier_payment"] },
      sourceId: {
        in: [
          ...deliveries.map((one) => one.id),
          ...row.payments.map((one) => one.id),
        ],
      },
    },
    columns: {
      sourceId: true,
      source: true,
      reference: true,
      farmAccountId: true,
      paymentMethod: true,
    },
  });
  const accountIds = events.flatMap((event) =>
    event.farmAccountId ? [event.farmAccountId] : []
  );
  const accounts = accountIds.length
    ? await db.query.farmAccount.findMany({
        where: { farmId, id: { in: accountIds } },
        columns: { id: true, name: true },
      })
    : [];
  const paymentFacts = (
    source: "feed_in" | "supplier_payment",
    paymentId: string
  ) => {
    const event = events.find(
      (one) => one.source === source && one.sourceId === paymentId
    );
    return {
      reference: event?.reference ?? null,
      accountName:
        accounts.find((account) => account.id === event?.farmAccountId)?.name ??
        null,
      paymentMethod: event?.paymentMethod ?? ("cash" as const),
    };
  };
  return {
    ...invoice,
    deliveries: deliveries.map((one) => ({
      ...one,
      quantity: Number(one.quantity),
      initialPayment: one.paidAtDeliveryMoney
        ? {
            id: one.id,
            amountMoney: one.paidAtDeliveryMoney,
            paidOn: farmDayOf(one.receivedOn),
            note: null,
            ...paymentFacts("feed_in", one.id),
          }
        : null,
    })),
    payments: row.payments.map((one) => ({
      ...one,
      ...paymentFacts("supplier_payment", one.id),
    })),
    ...supplierBalance(deliveries, row.payments),
    aging: supplierAging(row.dueOn, farmDayOf(now)),
    photoKeptAt: photo?.updatedAt ?? null,
  };
};

/** Under the shared farm lock, enforce amount and date bounds against receipts and every other payment. */
export const assertInvoicePayments = async (
  tx: Tx,
  farmId: string,
  id: string,
  change?: {
    delivery?:
      | {
          id: string;
          receivedOn: Date;
          priceMoney: number | null;
          paidAtDeliveryMoney: number | null;
        }
      | { id: string; voided: true };
    payment?: { id: string; paidOn: string; amountMoney: number };
  }
) => {
  const invoice = await tx.query.supplierInvoice.findFirst({
    where: { id, farmId },
    with: { deliveries: true, payments: true },
  });
  if (!invoice) {
    throw new ORPCError("NOT_FOUND", { message: "No such supplier invoice" });
  }
  const deliveries = invoice.deliveries.flatMap((row) => {
    const replacement =
      change?.delivery?.id === row.id ? change.delivery : undefined;
    if (replacement && "voided" in replacement) {
      return [];
    }
    const one = replacement ?? row;
    return [{ ...one, receivedOn: farmDayOf(one.receivedOn) }];
  });
  const payments: { id: string; paidOn: string; amountMoney: number }[] =
    invoice.payments.filter((row) => row.id !== change?.payment?.id);
  if (change?.payment) {
    payments.push(change.payment);
  }
  if (
    deliveries.some((row) => row.receivedOn < invoice.invoicedOn) ||
    payments.some((row) => row.paidOn < invoice.invoicedOn) ||
    !supplierPaymentsFit(deliveries, payments)
  ) {
    supplierRefused("supplier_payment_limit");
  }
  return invoice;
};

export const verifyDeliveryInvoice = async (
  tx: Tx,
  farmId: string,
  invoiceId: string | null
) => {
  if (invoiceId) {
    await assertInvoicePayments(tx, farmId, invoiceId);
  }
};

export const verifyCorrectedInvoice = async (
  tx: Tx,
  row: {
    id: string;
    farmId: string;
    supplierInvoiceId: string | null;
    receivedOn: Date;
    priceMoney: number | null;
    paidAtDeliveryMoney: number | null;
    counterpartyId: string | null;
  },
  paidWasChanged: boolean,
  owner: boolean
) => {
  if (!row.supplierInvoiceId) {
    if (paidWasChanged) {
      supplierRefused("supplier_invoice_required");
    }
    return;
  }
  if (paidWasChanged && !owner) {
    throw new ORPCError("FORBIDDEN", { data: { refusal: "owner_only" } });
  }
  const invoice = await assertInvoicePayments(
    tx,
    row.farmId,
    row.supplierInvoiceId,
    { delivery: row }
  );
  if (row.counterpartyId !== invoice.counterpartyId) {
    supplierRefused("supplier_invoice_supplier");
  }
};

export const suppliersList = async (
  db: Database | Tx,
  farmId: string,
  now: Date
) => {
  const [profiles, deliveries, payments, invoices, orders] = await Promise.all([
    db.query.supplierProfile.findMany({
      where: { farmId },
      with: { counterparty: true },
      orderBy: { createdAt: "asc", counterpartyId: "asc" },
    }),
    db.query.feedIn.findMany({
      where: { farmId, kind: "purchase" },
      columns: {
        counterpartyId: true,
        priceMoney: true,
        paidAtDeliveryMoney: true,
        receivedOn: true,
      },
    }),
    db.query.supplierPayment.findMany({ where: { farmId } }),
    db.query.supplierInvoice.findMany({
      where: { farmId },
      with: {
        deliveries: {
          columns: { priceMoney: true, paidAtDeliveryMoney: true },
        },
        payments: { columns: { amountMoney: true } },
      },
    }),
    db.query.feedPurchaseOrder.findMany({
      where: { farmId, state: { in: ["requested", "approved", "ordered"] } },
      columns: { counterpartyId: true },
    }),
  ]);
  const invoiceSupplier = new Map(
    invoices.map((row) => [row.id, row.counterpartyId])
  );
  const today = farmDayOf(now);
  return profiles.map(({ counterparty, ...profile }) => {
    const theirs = deliveries.filter(
      (row) => row.counterpartyId === profile.counterpartyId
    );
    const paid = payments.filter(
      (row) => invoiceSupplier.get(row.invoiceId) === profile.counterpartyId
    );
    const overdueMoney = invoices
      .filter(
        (row) =>
          row.counterpartyId === profile.counterpartyId && row.dueOn < today
      )
      .reduce(
        (sum, row) =>
          sum + supplierBalance(row.deliveries, row.payments).owingMoney,
        0
      );
    return {
      ...counterparty,
      ...profile,
      ...supplierBalance(theirs, paid),
      overdueMoney: Math.round(overdueMoney * 100) / 100,
      purchaseCount: theirs.length,
      activeOrders: orders.filter(
        (row) => row.counterpartyId === profile.counterpartyId
      ).length,
      lastPurchasedOn:
        theirs
          .map((row) => farmDayOf(row.receivedOn))
          .toSorted()
          .at(-1) ?? null,
    };
  });
};

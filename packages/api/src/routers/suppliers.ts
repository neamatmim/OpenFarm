import { supplierInvoicePhoto } from "@OpenFarm/db/schema/supplier";
import { farmDayOf } from "@OpenFarm/domain";
import { supplierBalance } from "@OpenFarm/domain/supplier-credit";
import { supplierPaymentPlan } from "@OpenFarm/domain/supplier-payment-plan";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { correct } from "../corrections/correction";
import {
  supplierPaymentCorrection,
  supplierPaymentCorrectionInput,
} from "../corrections/supplier-payment";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  counterpartyInput,
  farmAccountIdInput,
  paymentMethodInput,
  receiptInput,
  referenceInput,
} from "../money-inputs";
import { requirePersonalSession, requireRole } from "../roles";
import {
  supplierPaymentPaper,
  supplierStatementPaper,
} from "../supplier-papers";
import {
  invoiceDetails,
  lockSupplierFarm,
  paySupplier,
  saveSupplier,
  suppliersList,
} from "../supplier-store";

const read = protectedProcedure.use(requireRole("owner", "manager"));
const write = read.use(requirePersonalSession());
const owner = protectedProcedure
  .use(requireRole("owner"))
  .use(requirePersonalSession());
const reasonInput = z.string().trim().min(3).max(500);
const profileInput = {
  ...counterpartyInput.shape,
  contactPerson: z.string().trim().max(120).optional(),
  creditDays: z.number().int().min(0).max(365),
  note: z.string().trim().max(500).optional(),
};

const paymentOnInvoice = (
  invoice: Awaited<ReturnType<typeof invoiceDetails>>,
  id: string
) =>
  invoice.payments.find((payment) => payment.id === id) ??
  invoice.deliveries.find((delivery) => delivery.id === id)?.initialPayment ??
  null;

export const suppliersRouter = {
  paymentPlan: read.handler(async ({ context }) => {
    const today = farmDayOf(context.clock.now());
    const [rows, profiles] = await Promise.all([
      context.db.query.supplierInvoice.findMany({
        where: { farmId: context.farm.id },
        columns: { id: true, number: true, invoicedOn: true, dueOn: true },
        with: {
          supplier: { columns: { id: true, name: true, phone: true } },
          deliveries: {
            columns: { priceMoney: true, paidAtDeliveryMoney: true },
          },
          payments: { columns: { amountMoney: true } },
        },
      }),
      context.db.query.supplierProfile.findMany({
        where: { farmId: context.farm.id },
        columns: { counterpartyId: true, retiredAt: true },
      }),
    ]);
    const retired = new Set(
      profiles
        .filter((profile) => !!profile.retiredAt)
        .map((profile) => profile.counterpartyId)
    );
    return supplierPaymentPlan(
      rows.map(({ deliveries, payments, supplier, ...invoice }) => ({
        ...invoice,
        ...supplierBalance(deliveries, payments),
        supplier: { ...supplier, retired: retired.has(supplier.id) },
      })),
      today
    );
  }),
  invoice: read
    .input(z.object({ id: z.string().min(1) }))
    .handler(({ context, input }) =>
      invoiceDetails(context.db, context.farm.id, input.id, context.clock.now())
    ),
  invoices: read
    .input(z.object({ supplierId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const supplier = await context.db.query.supplierProfile.findFirst({
        where: { farmId: context.farm.id, counterpartyId: input.supplierId },
        columns: { counterpartyId: true },
      });
      if (!supplier) {
        throw new ORPCError("NOT_FOUND", { message: "No such supplier" });
      }
      const rows = await context.db.query.supplierInvoice.findMany({
        where: { farmId: context.farm.id, counterpartyId: input.supplierId },
        columns: { id: true, number: true, invoicedOn: true, dueOn: true },
        with: {
          deliveries: {
            columns: { priceMoney: true, paidAtDeliveryMoney: true },
          },
          payments: { columns: { amountMoney: true } },
        },
        orderBy: { invoicedOn: "desc", id: "desc" },
      });
      return rows.map(({ deliveries, payments, ...invoice }) => ({
        ...invoice,
        ...supplierBalance(deliveries, payments),
      }));
    }),
  paper: write
    .input(
      z.object({ supplierId: z.string(), paymentId: z.string().optional() })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const supplier = await context.db.query.counterparty.findFirst({
        where: { farmId: context.farm.id, id: input.supplierId },
      });
      if (!supplier) {
        throw new ORPCError("NOT_FOUND", { message: "No such supplier" });
      }
      const rows = await context.db.query.supplierInvoice.findMany({
        where: { farmId: context.farm.id, counterpartyId: supplier.id },
        columns: { id: true },
        orderBy: { invoicedOn: "asc", id: "asc" },
      });
      const invoices = await Promise.all(
        rows.map((row) =>
          invoiceDetails(context.db, context.farm.id, row.id, now)
        )
      );
      const invoice = input.paymentId
        ? invoices.find((one) => !!paymentOnInvoice(one, input.paymentId ?? ""))
        : undefined;
      const payment =
        invoice && input.paymentId
          ? paymentOnInvoice(invoice, input.paymentId)
          : null;
      if (input.paymentId && (!invoice || !payment)) {
        throw new ORPCError("NOT_FOUND", { message: "No such payment" });
      }
      const document =
        invoice && payment
          ? supplierPaymentPaper(context.farm, invoice, payment, now)
          : supplierStatementPaper(context.farm, supplier.name, invoices, now);
      await audited(context).write(
        {
          entity: input.paymentId ? "supplier_payment" : "supplier",
          entityId: input.paymentId ?? supplier.id,
          action: "export",
          after: { document },
        },
        () => Promise.resolve(null)
      );
      return { document };
    }),
  list: read.handler(({ context }) =>
    suppliersList(context.db, context.farm.id, context.clock.now())
  ),
  details: read
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const listed = await suppliersList(
        context.db,
        context.farm.id,
        context.clock.now()
      );
      const supplier = listed.find((row) => row.id === input.id);
      if (!supplier) {
        throw new ORPCError("NOT_FOUND", { message: "No such supplier" });
      }
      const [invoices, purchases, orders] = await Promise.all([
        context.db.query.supplierInvoice.findMany({
          where: { farmId: context.farm.id, counterpartyId: input.id },
          columns: { id: true },
          orderBy: { invoicedOn: "desc", id: "desc" },
        }),
        context.db.query.feedIn.findMany({
          where: {
            farmId: context.farm.id,
            counterpartyId: input.id,
            kind: "purchase",
          },
          with: {
            feedItem: { columns: { nameBn: true, nameEn: true, unit: true } },
          },
          orderBy: { receivedOn: "desc", id: "desc" },
        }),
        context.db.query.feedPurchaseOrder.findMany({
          where: { farmId: context.farm.id, counterpartyId: input.id },
          columns: {
            id: true,
            state: true,
            orderReference: true,
            neededOn: true,
            budgetMoney: true,
          },
          orderBy: { requestedAt: "desc" },
          limit: 100,
        }),
      ]);
      return {
        supplier,
        invoices: await Promise.all(
          invoices.map((row) =>
            invoiceDetails(
              context.db,
              context.farm.id,
              row.id,
              context.clock.now()
            )
          )
        ),
        purchases: purchases.map((row) => ({
          ...row,
          quantity: Number(row.quantity),
        })),
        orders,
      };
    }),
  save: write
    .input(
      z.object({
        id: z.string().uuid(),
        version: z.number().int().positive().optional(),
        ...profileInput,
        retired: z.boolean().default(false),
        reason: reasonInput.optional(),
      })
    )
    .handler(({ context, input }) => saveSupplier(context, input)),
  pay: owner
    .input(
      z.object({
        id: z.string().uuid(),
        invoiceId: z.string(),
        amountMoney: z.number().positive().max(100_000_000).multipleOf(0.01),
        paidOn: farmDay,
        paymentMethod: paymentMethodInput,
        farmAccountId: farmAccountIdInput,
        reference: referenceInput,
        note: z.string().trim().max(500).optional(),
      })
    )
    .handler(({ context, input }) => paySupplier(context, input)),
  correctPayment: owner
    .input(supplierPaymentCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, supplierPaymentCorrection, input)
    ),
  keepInvoicePhoto: write
    .input(
      z.object({
        invoiceId: z.string(),
        photo: receiptInput,
        reason: reasonInput,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "supplier_invoice",
          entityId: input.invoiceId,
          action: "update",
          reason: input.reason,
          before: (tx) =>
            invoiceDetails(tx, context.farm.id, input.invoiceId, now),
          after: (tx) =>
            invoiceDetails(tx, context.farm.id, input.invoiceId, now),
        },
        async (tx) => {
          await lockSupplierFarm(tx, context.farm.id);
          await invoiceDetails(tx, context.farm.id, input.invoiceId, now);
          await tx
            .insert(supplierInvoicePhoto)
            .values({
              invoiceId: input.invoiceId,
              farmId: context.farm.id,
              ...input.photo,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: supplierInvoicePhoto.invoiceId,
              set: { ...input.photo, updatedAt: now },
            });
        }
      );
      return { invoiceId: input.invoiceId };
    }),
  invoicePhoto: read
    .input(z.object({ invoiceId: z.string() }))
    .handler(async ({ context, input }) => {
      const photo = await context.db.query.supplierInvoicePhoto.findFirst({
        where: { invoiceId: input.invoiceId, farmId: context.farm.id },
        columns: { contentType: true, data: true },
      });
      if (!photo) {
        throw new ORPCError("NOT_FOUND", { message: "No invoice copy kept" });
      }
      return photo;
    }),
};

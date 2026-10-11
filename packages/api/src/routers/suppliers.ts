import { eq } from "@OpenFarm/db/operators";
import { counterparty } from "@OpenFarm/db/schema/fattening";
import {
  supplierInvoicePhoto,
  supplierPayment,
  supplierProfile,
} from "@OpenFarm/db/schema/supplier";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
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
import { knownAs } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  counterpartyInput,
  farmAccountIdInput,
  paymentMethodInput,
  receiptInput,
  referenceInput,
} from "../money-inputs";
import { accountSaid, bookingOf, bookMoney } from "../money-store";
import { requirePersonalSession, requireRole } from "../roles";
import {
  supplierPaymentPaper,
  supplierStatementPaper,
} from "../supplier-papers";
import {
  assertInvoicePayments,
  invoiceDetails,
  lockSupplierFarm,
  supplierRefused,
  suppliersList,
  validSupplierDay,
} from "../supplier-store";
import { seenWhenDone } from "../writes-seen";

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

const supplierContacts = (input: z.infer<typeof counterpartyInput>) => ({
  name: input.name.normalize("NFC"),
  address: input.address || null,
  phone: input.phone || null,
});
const supplierTerms = (input: {
  contactPerson?: string;
  creditDays: number;
  note?: string;
}) => ({
  contactPerson: input.contactPerson || null,
  creditDays: input.creditDays,
  note: input.note || null,
});

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
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      return await seenWhenDone(
        context.db.transaction(async (tx) => {
          await lockSupplierFarm(tx, context.farm.id);
          const existing = await tx.query.supplierProfile.findFirst({
            where: { farmId: context.farm.id, counterpartyId: input.id },
          });
          if (existing && input.version === undefined) {
            return { id: existing.counterpartyId };
          }
          if (
            existing &&
            (input.version !== existing.version || !input.reason)
          ) {
            supplierRefused("supplier_changed");
          }
          if (!existing && input.version !== undefined) {
            supplierRefused("supplier_missing");
          }
          if (
            Boolean(existing?.retiredAt) !== input.retired &&
            !context.roles.includes("owner")
          ) {
            throw new ORPCError("FORBIDDEN", {
              data: { refusal: "owner_only" },
            });
          }
          if (input.retired) {
            const pending = await tx.query.feedPurchaseOrder.findFirst({
              where: {
                farmId: context.farm.id,
                counterpartyId: input.id,
                state: { in: ["requested", "approved", "ordered"] },
              },
              columns: { id: true },
            });
            if (pending) {
              supplierRefused("supplier_open_orders");
            }
          }
          const known = await knownAs(tx, context.farm.id, input.name);
          if (known && known.id !== input.id) {
            supplierRefused("supplier_exists");
          }
          const { id } = input;
          const listed = await suppliersList(tx, context.farm.id, now);
          const before = existing ? listed.find((row) => row.id === id) : null;
          if (!existing) {
            await tx.insert(counterparty).values({
              id,
              farmId: context.farm.id,
              name: input.name.normalize("NFC"),
              createdAt: now,
            });
            await tx.insert(supplierProfile).values({
              counterpartyId: id,
              farmId: context.farm.id,
              createdAt: now,
            });
          }
          await tx
            .update(counterparty)
            .set(supplierContacts(input))
            .where(eq(counterparty.id, id));
          await tx
            .update(supplierProfile)
            .set({
              ...supplierTerms(input),
              retiredAt: input.retired ? now : null,
              version: existing ? existing.version + 1 : 1,
            })
            .where(eq(supplierProfile.counterpartyId, id));
          const afterList = await suppliersList(tx, context.farm.id, now);
          await audited(context).recordEvent(tx, {
            entity: "supplier",
            entityId: id,
            action: existing ? "update" : "create",
            reason: input.reason,
            before,
            after: afterList.find((row) => row.id === id),
          });
          return { id };
        })
      );
    }),
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
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      return await seenWhenDone(
        context.db.transaction(async (tx) => {
          await lockSupplierFarm(tx, context.farm.id);
          const existing = await tx.query.supplierPayment.findFirst({
            where: { id: input.id },
          });
          if (existing) {
            if (
              existing.farmId !== context.farm.id ||
              existing.invoiceId !== input.invoiceId ||
              existing.recordedBy !== context.actor.id
            ) {
              supplierRefused("supplier_changed");
            }
            return { id: existing.id };
          }
          if (
            !validSupplierDay(input.paidOn) ||
            input.paidOn > farmDayOf(now)
          ) {
            supplierRefused("supplier_invoice_days");
          }
          const invoice = await assertInvoicePayments(
            tx,
            context.farm.id,
            input.invoiceId,
            {
              payment: {
                id: input.id,
                amountMoney: input.amountMoney,
                paidOn: input.paidOn,
              },
            }
          );
          await tx.insert(supplierPayment).values({
            ...input,
            farmId: context.farm.id,
            note: input.note || null,
            recordedBy: context.actor.id,
            recordedByRole: context.roleUsed,
            recordedAt: now,
          });
          await bookMoney(
            tx,
            bookingOf(
              context,
              context.roleUsed,
              now,
              accountSaid(["supplier_payment"], input)
            ),
            {
              source: "supplier_payment",
              sourceId: input.id,
              amountMoney: input.amountMoney,
              occurredAt: startOfFarmDay(input.paidOn),
              counterpartyId: invoice.counterpartyId,
              paymentMethod: input.paymentMethod,
              categoryKey: "feed_in",
            }
          );
          await audited(context).recordEvent(tx, {
            entity: "supplier_payment",
            entityId: input.id,
            action: "create",
            after: await tx.query.supplierPayment.findFirst({
              where: { id: input.id },
            }),
          });
          return { id: input.id };
        })
      );
    }),
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

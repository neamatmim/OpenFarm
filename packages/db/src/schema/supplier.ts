import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ROLES, farm } from "./farm";
import { counterparty } from "./fattening";
import { PAYMENT_METHODS } from "./money";
import { numericMoney } from "./numeric-columns";

/** A supplier remains the same counterparty when the farm also sells to them. */
export const supplierProfile = pgTable(
  "supplier_profile",
  {
    counterpartyId: text("counterparty_id")
      .primaryKey()
      .references(() => counterparty.id),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    contactPerson: text("contact_person"),
    creditDays: integer("credit_days").notNull().default(0),
    note: text("note"),
    version: integer("version").notNull().default(1),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "supplier_profile_credit_days_not_negative",
      sql`${table.creditDays} >= 0`
    ),
    index("supplier_profile_farm_idx").on(table.farmId),
    check(
      "supplier_credit_days_check",
      sql`${table.creditDays} BETWEEN 0 AND 365`
    ),
  ]
);

/** One supplier invoice can cover several deliveries. Its value comes from those deliveries, never a second expense. */
export const supplierInvoice = pgTable(
  "supplier_invoice",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    counterpartyId: text("counterparty_id")
      .notNull()
      .references(() => counterparty.id),
    number: text("number").notNull(),
    invoicedOn: text("invoiced_on").notNull(),
    dueOn: text("due_on").notNull(),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("supplier_invoice_number_uidx").on(
      table.farmId,
      table.counterpartyId,
      sql`lower(${table.number})`
    ),
    check(
      "supplier_invoice_days_check",
      sql`${table.dueOn} >= ${table.invoicedOn}`
    ),
  ]
);

export const supplierInvoicePhoto = pgTable("supplier_invoice_photo", {
  invoiceId: text("invoice_id")
    .primaryKey()
    .references(() => supplierInvoice.id),
  farmId: text("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/** Actual payments, allocated explicitly to an invoice rather than silently to the oldest supplier balance. */
export const supplierPayment = pgTable(
  "supplier_payment",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => supplierInvoice.id),
    amountMoney: numericMoney("amount_money").notNull(),
    paidOn: text("paid_on").notNull(),
    paymentMethod: text("payment_method", { enum: PAYMENT_METHODS }).notNull(),
    note: text("note"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedByRole: text("recorded_by_role", { enum: ROLES }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "supplier_payment_amount_money_not_negative",
      sql`${table.amountMoney} >= 0`
    ),
    check(
      "supplier_payment_payment_method_known",
      sql`${table.paymentMethod} IN ('cash', 'mobile_money', 'bank')`
    ),
    check(
      "supplier_payment_recorded_by_role_known",
      sql`${table.recordedByRole} IN ('owner', 'manager', 'staff', 'vet')`
    ),
    index("supplier_payment_invoice_idx").on(table.farmId, table.invoiceId),
    check("supplier_payment_amount_check", sql`${table.amountMoney} > 0`),
  ]
);

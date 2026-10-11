import type {
  FarmIdentity,
  PaperDocument,
  PaperSection,
} from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { moneySaid } from "@OpenFarm/domain/joining-letter";
import { daySaid } from "@OpenFarm/domain/nominees";
import { letterheadOf } from "@OpenFarm/domain/paper-template";
import type { Said } from "@OpenFarm/domain/papers";

import type { feedPurchases } from "./feed-purchasing-store";
import type { invoiceDetails } from "./supplier-store";

const said = (bn: string, en: string): Said => ({ bn, en });
const text = (value: string): Said => said(value, value);
const makePaper = (
  farm: FarmIdentity,
  title: Said,
  preamble: Said,
  sections: PaperSection[],
  now: Date
): PaperDocument => ({
  letterhead: letterheadOf(farm),
  title,
  preamble,
  sections,
  closing: [],
  produced: said(
    `প্রস্তুত: ${daySaid(farmDayOf(now)).bn}`,
    `Produced: ${daySaid(farmDayOf(now)).en}`
  ),
});

export const purchaseOrderPaper = (
  farm: FarmIdentity,
  order: Awaited<ReturnType<typeof feedPurchases>>[number],
  now: Date
): PaperDocument =>
  makePaper(
    farm,
    said("খাদ্য ক্রয় আদেশ", "Feed purchase order"),
    said(
      "অনুমোদিত শর্ত অনুযায়ী নিচের খাদ্য সরবরাহের অনুরোধ করা হলো।",
      "Please supply the feed below under the approved terms."
    ),
    [
      {
        kind: "facts",
        heading: said("অর্ডারের বিবরণ", "Order details"),
        rows: [
          {
            label: said("অর্ডার নম্বর", "Order number"),
            value: text(order.orderReference ?? `PO-${order.id}`),
          },
          {
            label: said("সিস্টেম নম্বর ও সংশোধন", "System number and revision"),
            value: text(`${order.id} / ${order.version}`),
          },
          {
            label: said("সরবরাহকারী", "Supplier"),
            value: text(order.supplierName),
          },
          {
            label: said("ফোন", "Phone"),
            value: text(order.supplierPhone ?? "—"),
          },
          {
            label: said("দায়িত্বপ্রাপ্ত", "Responsible person"),
            value: text(order.assigneeName),
          },
          {
            label: said("প্রয়োজনের দিন", "Needed by"),
            value: daySaid(order.neededOn),
          },
          {
            label: said("সরবরাহের প্রতিশ্রুত দিন", "Promised delivery"),
            value: order.deliveryDueOn
              ? daySaid(order.deliveryDueOn)
              : text("—"),
          },
          {
            label: said("বাকির মেয়াদ (দিন)", "Credit terms (days)"),
            value: text(String(order.creditDays)),
          },
        ],
        note: order.note ? text(order.note) : null,
      },
      {
        kind: "table",
        heading: said("খাদ্য", "Feed"),
        columns: [
          { label: said("খাদ্য", "Item") },
          { label: said("পরিমাণ ও একক", "Quantity and unit") },
          { label: said("এককের দাম", "Unit price"), figures: true },
          { label: said("অনুমোদিত সীমা", "Approved limit"), figures: true },
        ],
        rows: [
          [
            said(order.nameBn, order.nameEn || order.nameBn),
            text(`${order.quantity} ${order.unit}`),
            moneySaid(order.unitPriceMoney),
            moneySaid(order.budgetMoney),
          ],
        ],
        foot: null,
        note: said(
          "প্রাপ্ত পরিমাণ ও সরবরাহকারীর বিল যাচাই করে টাকা পরিশোধ করা হবে। এটি সরবরাহকারীর ইনভয়েস নয়।",
          "Payment follows verification of received quantities and the supplier's bill. This document is a purchase order."
        ),
      },
      {
        kind: "signatures",
        heading: said("স্বাক্ষর", "Signatures"),
        signers: [
          { role: said("খামারের পক্ষে", "For the farm"), name: "" },
          {
            role: said("সরবরাহকারীর পক্ষে", "For the supplier"),
            name: order.supplierName,
          },
        ],
        dateBlank: said("তারিখ", "Date"),
        witnesses: [],
        witnessBlanks: [],
      },
    ],
    now
  );

type Invoice = Awaited<ReturnType<typeof invoiceDetails>>;
export const supplierStatementPaper = (
  farm: FarmIdentity,
  name: string,
  invoices: Invoice[],
  now: Date
) =>
  makePaper(
    farm,
    said("সরবরাহকারীর বকেয়া বিবরণী", "Supplier balance statement"),
    text(name),
    [
      {
        kind: "table",
        heading: said("ইনভয়েস অনুযায়ী হিসাব", "Balances by invoice"),
        columns: [
          { label: said("ইনভয়েস", "Invoice") },
          { label: said("পরিশোধের শেষ দিন", "Due date") },
          { label: said("ক্রয়মূল্য", "Purchased"), figures: true },
          { label: said("পরিশোধিত", "Paid"), figures: true },
          { label: said("বকেয়া", "Outstanding"), figures: true },
        ],
        rows: invoices.map((row) => [
          text(row.number),
          daySaid(row.dueOn),
          moneySaid(row.purchasedMoney),
          moneySaid(row.paidMoney),
          moneySaid(row.owingMoney),
        ]),
        foot: [
          said("মোট", "Total"),
          text(""),
          moneySaid(invoices.reduce((sum, row) => sum + row.purchasedMoney, 0)),
          moneySaid(invoices.reduce((sum, row) => sum + row.paidMoney, 0)),
          moneySaid(invoices.reduce((sum, row) => sum + row.owingMoney, 0)),
        ],
        note: said(
          "এটি খামারের সংরক্ষিত বিল ও পরিশোধের বর্তমান বিবরণী।",
          "Current balances from the farm's recorded supplier invoices and payments."
        ),
      },
    ],
    now
  );

export const supplierPaymentPaper = (
  farm: FarmIdentity,
  invoice: Invoice,
  payment: Pick<
    Invoice["payments"][number],
    | "id"
    | "paidOn"
    | "amountMoney"
    | "paymentMethod"
    | "note"
    | "reference"
    | "accountName"
  >,
  now: Date
) =>
  makePaper(
    farm,
    said("সরবরাহকারীকে পরিশোধের ভাউচার", "Supplier payment voucher"),
    text(invoice.supplier.name),
    [
      {
        kind: "facts",
        heading: said("পরিশোধের বিবরণ", "Payment details"),
        rows: [
          {
            label: said("ভাউচার নম্বর", "Voucher number"),
            value: text(`SP-${payment.id}`),
          },
          { label: said("ইনভয়েস", "Invoice"), value: text(invoice.number) },
          { label: said("তারিখ", "Paid on"), value: daySaid(payment.paidOn) },
          {
            label: said("লেনদেন নম্বর", "Transaction reference"),
            value: text(payment.reference ?? "—"),
          },
          {
            label: said("খামারের হিসাব", "Farm account"),
            value: text(payment.accountName ?? "—"),
          },
          {
            label: said("টাকা", "Amount"),
            value: moneySaid(payment.amountMoney),
          },
          {
            label: said("পদ্ধতি", "Method"),
            value: said(
              (
                {
                  cash: "নগদ",
                  bank: "ব্যাংক",
                  mobile_money: "মোবাইল ব্যাংকিং",
                } as const
              )[payment.paymentMethod],
              (
                {
                  cash: "Cash",
                  bank: "Bank",
                  mobile_money: "Mobile money",
                } as const
              )[payment.paymentMethod]
            ),
          },
        ],
        note: payment.note ? text(payment.note) : null,
      },
      {
        kind: "signatures",
        heading: said("স্বাক্ষর", "Signatures"),
        signers: [
          { role: said("প্রদানকারীর স্বাক্ষর", "Paid by"), name: "" },
          {
            role: said("গ্রহণকারীর স্বাক্ষর", "Received by"),
            name: invoice.supplier.name,
          },
        ],
        dateBlank: said("তারিখ", "Date"),
        witnesses: [],
        witnessBlanks: [],
      },
    ],
    now
  );

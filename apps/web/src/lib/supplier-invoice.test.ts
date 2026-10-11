import { expect, it } from "vitest";

import {
  EMPTY_INVOICE,
  invoiceOfDraft,
  invoiceReady,
  invoiceSent,
  savedInvoiceChosen,
  newInvoiceChosen,
  invoiceAfterSupplierChange,
} from "./supplier-invoice";

const CREDIT = { ...EMPTY_INVOICE, onCredit: true, invoiceNumber: " INV-17 " };

it("reuses a saved invoice's exact header while keeping this delivery's payment", () => {
  const saved = {
    id: "invoice-1",
    number: "INV-OLD",
    invoicedOn: "2026-09-01",
    dueOn: "2026-09-30",
  };
  const draft = { ...CREDIT, paidNow: "5000", ...savedInvoiceChosen(saved) };
  expect(draft.savedInvoiceId).toBe(saved.id);
  expect(invoiceSent(draft, "2026-10-12", "20000", 60)).toEqual({
    invoice: {
      number: saved.number,
      invoicedOn: saved.invoicedOn,
      dueOn: saved.dueOn,
    },
    paidAtDeliveryMoney: 5000,
  });
});

it("clears a saved invoice when switching suppliers but keeps the delivery payment", () => {
  const saved = {
    ...CREDIT,
    savedInvoiceId: "invoice-1",
    invoicedOn: "2026-10-01",
    dueOn: "2026-10-30",
    paidNow: "5000",
  };
  const draft = {
    ...saved,
    ...invoiceAfterSupplierChange(saved, "supplier-1", "supplier-2"),
  };
  expect(draft).toMatchObject({
    savedInvoiceId: "",
    invoiceNumber: "",
    invoicedOn: "",
    dueOn: "",
    paidNow: "5000",
    onCredit: true,
  });
  expect(invoiceReady(draft, "2026-10-12", "20000", 30)).toBe(false);
  expect(invoiceAfterSupplierChange(saved, "supplier-1", "supplier-1")).toEqual(
    {}
  );
  expect(
    invoiceAfterSupplierChange(CREDIT, "supplier-1", "supplier-2")
  ).toEqual({});
});

it("starts a new invoice without copying the previous invoice's dates or payment history", () => {
  const draft = {
    ...CREDIT,
    savedInvoiceId: "invoice-1",
    invoicedOn: "2026-09-01",
    dueOn: "2026-09-30",
    ...newInvoiceChosen(),
  };
  expect(invoiceOfDraft(draft, "2026-10-12", 30)).toMatchObject({
    savedInvoiceId: "",
    invoiceNumber: "",
    invoicedOn: "2026-10-12",
    dueOn: "2026-11-11",
    paidNow: "0",
  });
});

it("updates suggested dates when the delivery day or supplier terms change", () => {
  expect(invoiceOfDraft(CREDIT, "2026-10-12", 30)).toMatchObject({
    invoicedOn: "2026-10-12",
    dueOn: "2026-11-11",
  });
  expect(invoiceOfDraft(CREDIT, "2026-10-10", 30)).toMatchObject({
    invoicedOn: "2026-10-10",
    dueOn: "2026-11-09",
  });
  expect(invoiceOfDraft(CREDIT, "2026-10-10", 15).dueOn).toBe("2026-10-25");
  expect(invoiceOfDraft(CREDIT, "2028-02-28", 2).dueOn).toBe("2028-03-01");
});

it("preserves invoice dates and due dates explicitly entered by the user", () => {
  const draft = { ...CREDIT, invoicedOn: "2026-10-01", dueOn: "2026-11-05" };
  expect(invoiceOfDraft(draft, "2026-10-15", 60)).toMatchObject({
    invoicedOn: "2026-10-01",
    dueOn: "2026-11-05",
  });
  expect(invoiceSent(draft, "2026-10-15", "20000", 60).invoice).toEqual({
    number: "INV-17",
    invoicedOn: "2026-10-01",
    dueOn: "2026-11-05",
  });
});

it("validates and submits the same suggested dates shown with a partial payment", () => {
  const draft = { ...CREDIT, paidNow: "5000" };
  const shown = invoiceOfDraft(draft, "2026-10-12", 30);
  expect(invoiceReady(draft, "2026-10-12", "20000", 30)).toBe(true);
  expect(invoiceSent(draft, "2026-10-12", "20000", 30)).toEqual({
    invoice: {
      number: "INV-17",
      invoicedOn: shown.invoicedOn,
      dueOn: shown.dueOn,
    },
    paidAtDeliveryMoney: 5000,
  });
  expect(invoiceReady(CREDIT, "2026-10-12", "20000", 30)).toBe(true);
  expect(
    invoiceSent(CREDIT, "2026-10-12", "20000", 30).paidAtDeliveryMoney
  ).toBe(0);
});

it.each([
  { draft: { ...CREDIT, invoiceNumber: "" }, received: "2026-10-12" },
  { draft: { ...CREDIT, paidNow: "" }, received: "2026-10-12" },
  { draft: { ...CREDIT, paidNow: "-1" }, received: "2026-10-12" },
  { draft: { ...CREDIT, paidNow: "20000.01" }, received: "2026-10-12" },
  { draft: { ...CREDIT, paidNow: "bad" }, received: "2026-10-12" },
  { draft: { ...CREDIT, invoicedOn: "2026-10-13" }, received: "2026-10-12" },
  { draft: { ...CREDIT, invoicedOn: "2026-02-30" }, received: "2026-10-12" },
  { draft: { ...CREDIT, dueOn: "2026-10-11" }, received: "2026-10-12" },
  { draft: { ...CREDIT, dueOn: "2026-02-30" }, received: "2026-02-28" },
  { draft: CREDIT, received: "2026-02-30" },
  { draft: CREDIT, received: "" },
])("rejects invalid invoice dates or payments: %j", ({ draft, received }) => {
  expect(invoiceReady(draft, received, "20000", 30)).toBe(false);
});

it("allows clearing the delivery date without throwing while editing", () => {
  expect(invoiceOfDraft(CREDIT, "", 30)).toMatchObject({
    invoicedOn: "",
    dueOn: "",
  });
});

it("keeps fully paid purchases without an invoice and books the full price when one is kept", () => {
  expect(invoiceReady(EMPTY_INVOICE, "2026-10-12", "20000", 30)).toBe(true);
  expect(invoiceSent(EMPTY_INVOICE, "2026-10-12", "20000", 30)).toEqual({});
  const paid = { ...CREDIT, onCredit: false, paidNow: "5000" };
  expect(invoiceSent(paid, "2026-10-12", "20000", 30).paidAtDeliveryMoney).toBe(
    20_000
  );
});

import { addDays, isAFarmDay } from "@OpenFarm/domain";

export interface SupplierInvoiceDraft {
  savedInvoiceId: string;
  onCredit: boolean;
  invoiceNumber: string;
  invoicedOn: string;
  dueOn: string;
  paidNow: string;
}

export const EMPTY_INVOICE: SupplierInvoiceDraft = {
  savedInvoiceId: "",
  onCredit: false,
  invoiceNumber: "",
  invoicedOn: "",
  dueOn: "",
  paidNow: "0",
};

export interface SavedSupplierInvoice {
  id: string;
  number: string;
  invoicedOn: string;
  dueOn: string;
}

export const savedInvoiceChosen = (
  invoice: SavedSupplierInvoice
): Partial<SupplierInvoiceDraft> => ({
  savedInvoiceId: invoice.id,
  invoiceNumber: invoice.number,
  invoicedOn: invoice.invoicedOn,
  dueOn: invoice.dueOn,
});

export const newInvoiceChosen = (): Partial<SupplierInvoiceDraft> => ({
  savedInvoiceId: "",
  invoiceNumber: "",
  invoicedOn: "",
  dueOn: "",
});

export const invoiceAfterSupplierChange = (
  draft: SupplierInvoiceDraft,
  previousSupplierId: string,
  supplierId: string
): Partial<SupplierInvoiceDraft> =>
  draft.savedInvoiceId && previousSupplierId !== supplierId
    ? newInvoiceChosen()
    : {};

/** Empty dates follow the delivery and supplier terms until the user writes a date. */
export const invoiceOfDraft = (
  draft: SupplierInvoiceDraft,
  receivedOn: string,
  creditDays: number
): SupplierInvoiceDraft => ({
  ...draft,
  invoicedOn: draft.invoicedOn || receivedOn,
  dueOn:
    draft.dueOn ||
    (isAFarmDay(receivedOn) ? addDays(receivedOn, creditDays) : ""),
});

export const invoiceReady = (
  draft: SupplierInvoiceDraft,
  receivedOn: string,
  price: string,
  creditDays: number
): boolean => {
  if (!draft.onCredit && !draft.invoiceNumber.trim()) {
    return true;
  }
  const invoice = invoiceOfDraft(draft, receivedOn, creditDays);
  const priceMoney = Number(price);
  const paid = draft.onCredit ? Number(draft.paidNow) : priceMoney;
  return (
    !!draft.invoiceNumber.trim() &&
    isAFarmDay(receivedOn) &&
    isAFarmDay(invoice.invoicedOn) &&
    invoice.invoicedOn <= receivedOn &&
    isAFarmDay(invoice.dueOn) &&
    invoice.dueOn >= invoice.invoicedOn &&
    (!draft.onCredit || draft.paidNow.trim() !== "") &&
    Number.isFinite(priceMoney) &&
    priceMoney > 0 &&
    Number.isFinite(paid) &&
    paid >= 0 &&
    paid <= priceMoney
  );
};

export const invoiceSent = (
  draft: SupplierInvoiceDraft,
  receivedOn: string,
  price: string,
  creditDays: number
) => {
  if (!draft.onCredit && !draft.invoiceNumber.trim()) {
    return {};
  }
  const invoice = invoiceOfDraft(draft, receivedOn, creditDays);
  return {
    invoice: {
      number: draft.invoiceNumber.trim(),
      invoicedOn: invoice.invoicedOn,
      dueOn: invoice.dueOn,
    },
    paidAtDeliveryMoney: draft.onCredit ? Number(draft.paidNow) : Number(price),
  };
};

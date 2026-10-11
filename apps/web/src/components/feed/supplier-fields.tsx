import { Button } from "@OpenFarm/ui/components/button";
import { FieldGroup } from "@OpenFarm/ui/components/field";
import { Input } from "@OpenFarm/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useId } from "react";

import { FormField, NativeSelect, WorkedOut } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { invoiceOfDraft } from "@/lib/supplier-invoice";
import type { SupplierInvoiceDraft } from "@/lib/supplier-invoice";
import { orpc } from "@/utils/orpc";

import { SupplierInvoiceReference } from "./supplier-invoice-reference";

export const REFUSALS = {
  supplier_missing: "suppliers.missing",
  supplier_retired: "suppliers.retiredRefusal",
  supplier_changed: "suppliers.changed",
  supplier_exists: "suppliers.exists",
  supplier_open_orders: "suppliers.openOrders",
  supplier_invoice_days: "suppliers.invoiceDays",
  supplier_invoice_changed: "suppliers.invoiceChanged",
  supplier_invoice_required: "suppliers.invoiceRequired",
  supplier_invoice_purchase: "suppliers.invoicePurchase",
  supplier_invoice_supplier: "suppliers.invoiceSupplier",
  supplier_payment_limit: "suppliers.paymentLimit",
} as const;

export interface SupplierChoice {
  id: string;
  name: string;
  phone: string;
  creditDays: number;
}
export const SupplierField = ({
  name,
  supplierId,
  onChange,
  onNewSupplier,
  disabled = false,
}: {
  name: string;
  supplierId: string;
  onChange: (supplier: SupplierChoice) => void;
  onNewSupplier: () => void;
  disabled?: boolean;
}) => {
  const { t } = useLanguage();
  const prefix = useId();
  const suppliers = useQuery(orpc.suppliers.list.queryOptions());
  const fieldId = `${prefix}-supplier`;
  const active = (suppliers.data ?? []).filter((row) => !row.retiredAt);
  return (
    <FormField id={fieldId} label={t("purchasing.supplier")}>
      {disabled ? (
        <Input id={fieldId} value={name} readOnly />
      ) : (
        <div className="flex gap-2">
          <NativeSelect
            className="min-w-0 flex-1"
            id={fieldId}
            value={supplierId}
            required
            onChange={(event) => {
              const chosen = suppliers.data?.find(
                (row) => row.id === event.target.value
              );
              onChange(
                chosen
                  ? {
                      id: chosen.id,
                      name: chosen.name,
                      phone: chosen.phone ?? "",
                      creditDays: chosen.creditDays,
                    }
                  : { id: "", name: "", phone: "", creditDays: 0 }
              );
            }}
          >
            <option value="" disabled>
              {!supplierId && name ? name : t("suppliers.choose")}
            </option>
            {supplierId && !active.some((row) => row.id === supplierId) ? (
              <option value={supplierId}>{name}</option>
            ) : null}
            {active.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 md:h-9"
            onClick={onNewSupplier}
          >
            <Plus aria-hidden data-icon="inline-start" />
            {t("suppliers.new")}
          </Button>
        </div>
      )}
    </FormField>
  );
};

export const SupplierInvoiceFields = ({
  draft,
  onChange,
  receivedOn,
  price,
  creditDays,
  supplierId,
}: {
  draft: SupplierInvoiceDraft;
  onChange: (change: Partial<SupplierInvoiceDraft>) => void;
  receivedOn: string;
  price: string;
  creditDays: number;
  supplierId: string;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const prefix = useId();
  const shown = invoiceOfDraft(draft, receivedOn, creditDays);
  return (
    <FieldGroup className="gap-4">
      <FormField id={`${prefix}-terms`} label={t("suppliers.paymentTerms")}>
        <NativeSelect
          id={`${prefix}-terms`}
          value={draft.onCredit ? "credit" : "paid"}
          onChange={(event) =>
            onChange({
              onCredit: event.target.value === "credit",
            })
          }
        >
          <option value="paid">{t("suppliers.fullyPaid")}</option>
          <option value="credit">{t("suppliers.credit")}</option>
        </NativeSelect>
      </FormField>
      <SupplierInvoiceReference
        id={`${prefix}-invoice`}
        draft={draft}
        supplierId={supplierId}
        receivedOn={receivedOn}
        onChange={onChange}
      />
      {draft.onCredit || draft.invoiceNumber.trim() ? (
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <FormField id={`${prefix}-issued`} label={t("suppliers.invoiceDate")}>
            <Input
              id={`${prefix}-issued`}
              type="date"
              required
              readOnly={!!draft.savedInvoiceId}
              value={shown.invoicedOn}
              max={receivedOn}
              onChange={(event) => onChange({ invoicedOn: event.target.value })}
            />
          </FormField>
          <FormField id={`${prefix}-due`} label={t("suppliers.dueOn")}>
            <Input
              id={`${prefix}-due`}
              type="date"
              required
              readOnly={!!draft.savedInvoiceId}
              value={shown.dueOn}
              min={shown.invoicedOn}
              onChange={(event) => onChange({ dueOn: event.target.value })}
            />
          </FormField>
          {draft.onCredit ? (
            <>
              <FormField id={`${prefix}-paid`} label={t("suppliers.paidNow")}>
                <Input
                  id={`${prefix}-paid`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  max={Number(price) || undefined}
                  required
                  value={draft.paidNow}
                  onChange={(event) =>
                    onChange({ paidNow: event.target.value })
                  }
                />
              </FormField>
              <WorkedOut>
                {t("suppliers.deliveryOwing")}:{" "}
                {asMoney(Math.max(0, Number(price) - Number(draft.paidNow)))}
              </WorkedOut>
            </>
          ) : null}
        </FieldGroup>
      ) : null}
    </FieldGroup>
  );
};

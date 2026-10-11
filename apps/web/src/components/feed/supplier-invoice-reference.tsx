import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@OpenFarm/ui/components/dialog";
import { FieldGroup } from "@OpenFarm/ui/components/field";
import { Input } from "@OpenFarm/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { Files } from "lucide-react";
import { useId, useState } from "react";

import { Notice } from "@/components/page";
import { FormField, WorkedOut } from "@/components/page-kit";
import { SearchablePicker } from "@/components/searchable-picker";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { newInvoiceChosen, savedInvoiceChosen } from "@/lib/supplier-invoice";
import type { SupplierInvoiceDraft } from "@/lib/supplier-invoice";
import { orpc } from "@/utils/orpc";

export const SupplierInvoiceReference = ({
  id,
  draft,
  supplierId,
  receivedOn,
  onChange,
}: {
  id: string;
  draft: SupplierInvoiceDraft;
  supplierId: string;
  receivedOn: string;
  onChange: (change: Partial<SupplierInvoiceDraft>) => void;
}) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState("");
  const invoices = useQuery({
    ...orpc.suppliers.invoices.queryOptions({ input: { supplierId } }),
    enabled: !!supplierId && (open || !!draft.savedInvoiceId),
  });
  const eligible = (invoices.data ?? []).filter(
    (invoice) => invoice.invoicedOn <= receivedOn
  );
  const picked = eligible.find((invoice) => invoice.id === pickedId);
  const kept = invoices.data?.find(
    (invoice) => invoice.id === draft.savedInvoiceId
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <FieldGroup className="gap-2">
        <FormField
          id={id}
          label={t("suppliers.invoiceNumber")}
          hint={t(
            draft.savedInvoiceId
              ? "suppliers.savedInvoiceHint"
              : "suppliers.invoiceHint"
          )}
        >
          <div className="flex gap-2">
            <Input
              id={id}
              className="min-w-0 flex-1"
              value={draft.invoiceNumber}
              readOnly={!!draft.savedInvoiceId}
              required={draft.onCredit}
              maxLength={120}
              onChange={(event) =>
                onChange({ invoiceNumber: event.target.value })
              }
            />
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0 md:h-9"
                  disabled={!supplierId}
                />
              }
              onClick={() => setPickedId(draft.savedInvoiceId)}
            >
              <Files aria-hidden data-icon="inline-start" />
              {t("suppliers.savedInvoices")}
            </DialogTrigger>
          </div>
        </FormField>
        {kept ? (
          <WorkedOut>
            {t("suppliers.invoiceBalance", { money: asMoney(kept.owingMoney) })}
          </WorkedOut>
        ) : null}
      </FieldGroup>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("suppliers.chooseInvoice")}</DialogTitle>
          <DialogDescription>
            {t("suppliers.chooseInvoiceHint")}
          </DialogDescription>
        </DialogHeader>
        {invoices.isError ? (
          <Notice
            tone="danger"
            title={t("common.loadFailed")}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await invoices.refetch();
                }}
              >
                {t("common.retry")}
              </Button>
            }
          />
        ) : (
          <SearchablePicker
            id={searchId}
            value={pickedId}
            onChange={setPickedId}
            loading={invoices.isPending}
            placeholder={t("suppliers.searchInvoices")}
            empty={t("suppliers.noEligibleInvoices")}
            options={eligible.map((invoice) => ({
              value: invoice.id,
              label: invoice.number,
              detail: `${formatDate(new Date(`${invoice.invoicedOn}T00:00:00Z`), language, "date")} · ${t("suppliers.invoiceBalance", { money: asMoney(invoice.owingMoney) })}`,
            }))}
          />
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onChange(newInvoiceChosen());
              setOpen(false);
            }}
          >
            {t("suppliers.newInvoice")}
          </Button>
          <Button
            type="button"
            disabled={!picked || !invoices.isSuccess}
            onClick={() => {
              if (picked) {
                onChange(savedInvoiceChosen(picked));
                setOpen(false);
              }
            }}
          >
            {t("suppliers.useInvoice")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

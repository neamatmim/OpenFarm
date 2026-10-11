import type { PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { FieldGroup } from "@OpenFarm/ui/components/field";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";

import { FormField, FormSheet } from "@/components/page-kit";
import {
  accountSent,
  NO_ACCOUNT,
  PaymentMethodField,
} from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import { REFUSALS } from "./supplier-fields";
import type { SupplierChoice } from "./supplier-fields";

export type Supplier = Awaited<
  ReturnType<typeof orpc.suppliers.list.call>
>[number];
export type SupplierDetails = Awaited<
  ReturnType<typeof orpc.suppliers.details.call>
>;
export type Invoice = SupplierDetails["invoices"][number];
export type PayableInvoice = Pick<
  Invoice,
  "id" | "number" | "invoicedOn" | "owingMoney"
> & { supplier: { name: string } };

const supplierFormDefaults = (supplier?: Supplier) => ({
  name: supplier?.name ?? "",
  phone: supplier?.phone ?? "",
  address: supplier?.address ?? "",
  contact: supplier?.contactPerson ?? "",
  creditDays: String(supplier?.creditDays ?? 0),
  note: supplier?.note ?? "",
});

export const SupplierSheet = ({
  supplier,
  onClose,
  owner,
  onCreated,
}: {
  supplier?: Supplier;
  onClose: () => void;
  owner: boolean;
  onCreated?: (supplier: SupplierChoice) => void;
}) => {
  const { t } = useLanguage();
  const prefix = useId();
  const [id, setId] = useState(() => supplier?.id ?? crypto.randomUUID());
  const defaults = supplierFormDefaults(supplier);
  const [name, setName] = useState(defaults.name);
  const [phone, setPhone] = useState(defaults.phone);
  const [address, setAddress] = useState(defaults.address);
  const [contact, setContact] = useState(defaults.contact);
  const [creditDays, setCreditDays] = useState(
    String(supplier?.creditDays ?? 0)
  );
  const [note, setNote] = useState(defaults.note);
  const [reason, setReason] = useState("");
  const [retired, setRetired] = useState(!!supplier?.retiredAt);
  const refused = useRefused(REFUSALS);
  const save = useMutation(
    orpc.suppliers.save.mutationOptions({
      onSuccess: (made) => {
        toast.success(t("suppliers.saved"));
        setId(crypto.randomUUID());
        onCreated?.({
          id: made.id,
          name: name.trim(),
          phone: phone.trim(),
          creditDays: Number(creditDays),
        });
        onClose();
      },
      onError: refused,
    })
  );
  const ready =
    !!name.trim() &&
    Number.isInteger(Number(creditDays)) &&
    Number(creditDays) >= 0 &&
    Number(creditDays) <= 365 &&
    (!supplier || reason.trim().length >= 3);
  return (
    <FormSheet
      title={t(supplier ? "suppliers.edit" : "suppliers.add")}
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      ready={ready}
      pending={save.isPending}
      submitLabel={t("suppliers.save")}
      onSubmit={() =>
        save.mutate({
          id,
          version: supplier?.version,
          name,
          phone,
          address,
          contactPerson: contact,
          creditDays: Number(creditDays),
          note,
          retired,
          reason: reason || undefined,
        })
      }
    >
      <FieldGroup className="gap-4">
        <FormField id={`${prefix}-name`} label={t("purchasing.supplier")}>
          <Input
            id={`${prefix}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
          />
        </FormField>
        <FormField id={`${prefix}-phone`} label={t("purchasing.phone")}>
          <Input
            id={`${prefix}-phone`}
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={40}
          />
        </FormField>
        <FormField id={`${prefix}-address`} label={t("suppliers.address")}>
          <Input
            id={`${prefix}-address`}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            maxLength={300}
          />
        </FormField>
        <FormField id={`${prefix}-contact`} label={t("suppliers.contact")}>
          <Input
            id={`${prefix}-contact`}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            maxLength={120}
          />
        </FormField>
        <FormField id={`${prefix}-days`} label={t("suppliers.creditDays")}>
          <Input
            id={`${prefix}-days`}
            type="number"
            min="0"
            max="365"
            step="1"
            value={creditDays}
            onChange={(event) => setCreditDays(event.target.value)}
            required
          />
        </FormField>
        <FormField id={`${prefix}-note`} label={t("purchasing.note")}>
          <Input
            id={`${prefix}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />
        </FormField>
        {supplier ? (
          <FormField id={`${prefix}-reason`} label={t("purchasing.reason")}>
            <Input
              id={`${prefix}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={3}
              maxLength={500}
              required
            />
          </FormField>
        ) : null}
        {supplier && owner ? (
          <label
            className="flex items-center gap-2"
            htmlFor={`${prefix}-retired`}
          >
            <input
              id={`${prefix}-retired`}
              type="checkbox"
              checked={retired}
              onChange={(event) => setRetired(event.target.checked)}
            />
            {t("suppliers.retire")}
          </label>
        ) : null}
      </FieldGroup>
    </FormSheet>
  );
};

export const NewSupplierSheet = ({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (supplier: SupplierChoice) => void;
}) =>
  open ? (
    <SupplierSheet owner={false} onClose={onClose} onCreated={onCreated} />
  ) : null;

const paymentReady = (
  amount: string,
  invoice: PayableInvoice,
  paidOn: string
) =>
  paidOn >= invoice.invoicedOn &&
  paidOn <= farmDayOf(new Date()) &&
  Number(amount) <= invoice.owingMoney &&
  Number(amount) > 0;

export const SupplierPaymentSheet = ({
  invoice,
  onClose,
}: {
  invoice: PayableInvoice;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const [id, setId] = useState(() => crypto.randomUUID());
  const prefix = useId();
  const [amount, setAmount] = useState(String(invoice.owingMoney));
  const [paidOn, setPaidOn] = useState(farmDayOf(new Date()));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [account, setAccount] = useState(NO_ACCOUNT);
  const [note, setNote] = useState("");
  const refused = useRefused(REFUSALS);
  const pay = useMutation(
    orpc.suppliers.pay.mutationOptions({
      onSuccess: () => {
        toast.success(t("suppliers.paymentSaved"));
        setId(crypto.randomUUID());
        onClose();
      },
      onError: refused,
    })
  );
  return (
    <FormSheet
      title={t("suppliers.pay")}
      description={`${invoice.supplier.name} · ${invoice.number}`}
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      pending={pay.isPending}
      ready={paymentReady(amount, invoice, paidOn)}
      submitLabel={t("suppliers.pay")}
      onSubmit={() =>
        pay.mutate({
          id,
          invoiceId: invoice.id,
          amountMoney: Number(amount),
          paidOn,
          paymentMethod: method,
          ...accountSent(method, account),
          note: note || undefined,
        })
      }
    >
      <FieldGroup className="gap-4">
        <FormField id={`${prefix}-amount`} label={t("suppliers.amount")}>
          <Input
            id={`${prefix}-amount`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            max={invoice.owingMoney}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </FormField>
        <FormField id={`${prefix}-day`} label={t("suppliers.paidOn")}>
          <Input
            id={`${prefix}-day`}
            type="date"
            value={paidOn}
            min={invoice.invoicedOn}
            max={farmDayOf(new Date())}
            onChange={(event) => setPaidOn(event.target.value)}
            required
          />
        </FormField>
        <PaymentMethodField
          id={`${prefix}-method`}
          value={method}
          onChange={setMethod}
          account={{ typed: account, onChange: setAccount }}
        />
        <FormField id={`${prefix}-note`} label={t("purchasing.note")}>
          <Input
            id={`${prefix}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />
        </FormField>
      </FieldGroup>
    </FormSheet>
  );
};

export const VoidSupplierPaymentSheet = ({
  payment,
  onClose,
}: {
  payment: Invoice["payments"][number];
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const prefix = useId();
  const [reason, setReason] = useState("");
  const refused = useRefused(REFUSALS);
  const voidPayment = useMutation(
    orpc.suppliers.correctPayment.mutationOptions({
      onSuccess: () => {
        toast.success(t("suppliers.paymentVoided"));
        onClose();
      },
      onError: refused,
    })
  );
  return (
    <FormSheet
      title={t("suppliers.voidPayment")}
      description={t("suppliers.voidHint")}
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      pending={voidPayment.isPending}
      ready={reason.trim().length >= 3}
      submitLabel={t("suppliers.voidPayment")}
      onSubmit={() =>
        voidPayment.mutate({
          id: payment.id,
          reason,
          changes: { voided: { from: false, to: true } },
        })
      }
    >
      <FormField id={`${prefix}-reason`} label={t("purchasing.reason")}>
        <Input
          id={`${prefix}-reason`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={3}
          maxLength={500}
          required
        />
      </FormField>
    </FormSheet>
  );
};

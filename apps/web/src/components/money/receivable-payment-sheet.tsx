import type { ReceivableKind, PaymentMethod } from "@OpenFarm/domain";
import { RECEIVABLE_KINDS, farmDayOf } from "@OpenFarm/domain";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import type { AccountTyped } from "@/components/payment-method";
import {
  accountSent,
  NO_ACCOUNT,
  PaymentMethodField,
} from "@/components/payment-method";
import { WhoseHandField } from "@/components/whose-hand";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** Who is paying and for what, when the sheet is opened from his row. */
export interface PaymentFor {
  buyer: string;
  kind: ReceivableKind;
}

/**
 * A buyer paying towards his Receivable: how much, for his cattle or his milk, the day it came and how. It clears his oldest
 * Receivable first; more than he owes is taken only with a note saying why.
 */
export const ReceivablePaymentSheet = ({
  paying,
  onClose,
}: {
  paying: PaymentFor | null;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [kind, setKind] = useState<ReceivableKind>(paying?.kind ?? "cattle");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(() => farmDayOf(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [account, setAccount] = useState<AccountTyped>(NO_ACCOUNT);
  const [heldBy, setHeldBy] = useState("");
  const [note, setNote] = useState("");
  const pay = useMutation(
    orpc.receivables.pay.mutationOptions({
      onSuccess: () => {
        toast.success(t("receivable.recorded"));
        setAmount("");
        setNote("");
        onClose();
      },
      onError: refused,
    })
  );
  const figure = Number(amount);
  const ready = paying !== null && amount.trim() !== "" && figure > 0;
  return (
    <FormSheet
      description={t("receivable.paymentDescription")}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onSubmit={() => {
        if (paying) {
          pay.mutate({
            buyer: paying.buyer,
            kind,
            amountMoney: figure,
            paidOn,
            paymentMethod,
            ...accountSent(paymentMethod, account),
            ...(paymentMethod === "cash" && heldBy ? { heldBy } : {}),
            note: note.trim() || undefined,
          });
        }
      }}
      open={paying !== null}
      pending={pay.isPending}
      ready={ready}
      submitLabel={t("receivable.record")}
      title={t("receivable.paymentTitle")}
    >
      <FormField id="receivable-buyer" label={t("receivable.buyer")}>
        <Input disabled id="receivable-buyer" value={paying?.buyer ?? ""} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="receivable-kind" label={t("receivable.kind")}>
          <NativeSelect
            id="receivable-kind"
            onChange={(event) =>
              setKind(
                RECEIVABLE_KINDS.find((one) => one === event.target.value) ??
                  "cattle"
              )
            }
            value={kind}
          >
            {RECEIVABLE_KINDS.map((one) => (
              <option key={one} value={one}>
                {t(
                  one === "milk"
                    ? "receivable.kind.milk"
                    : "receivable.kind.cattle"
                )}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="receivable-amount" label={t("receivable.amount")}>
          <Input
            autoComplete="off"
            id="receivable-amount"
            inputMode="numeric"
            min={0}
            onChange={(event) => setAmount(event.target.value)}
            required
            type="number"
            value={amount}
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="receivable-paid-on" label={t("receivable.paidOn")}>
          <Input
            id="receivable-paid-on"
            onChange={(event) => setPaidOn(event.target.value)}
            required
            type="date"
            value={paidOn}
          />
        </FormField>
        <PaymentMethodField
          account={{ typed: account, onChange: setAccount }}
          id="receivable-paid-by"
          onChange={setPaymentMethod}
          value={paymentMethod}
        />
        {paymentMethod === "cash" ? (
          <WhoseHandField
            id="receivable-whose-hand"
            onChange={setHeldBy}
            value={heldBy}
          />
        ) : null}
      </div>
      <FormField
        hint={t("receivable.noteHint")}
        id="receivable-note"
        label={t("receivable.note")}
      >
        <Input
          autoComplete="off"
          id="receivable-note"
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};

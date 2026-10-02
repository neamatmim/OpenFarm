import type { BakiKind, PaymentMethod } from "@OpenFarm/domain";
import { BAKI_KINDS, farmDayOf } from "@OpenFarm/domain";
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
  kind: BakiKind;
}

/**
 * A buyer paying towards his Baki: how much, for his cattle or his milk, the day it came and how. It clears his oldest
 * Baki first; more than he owes is taken only with a note saying why.
 */
export const BakiPaymentSheet = ({
  paying,
  onClose,
}: {
  paying: PaymentFor | null;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [kind, setKind] = useState<BakiKind>(paying?.kind ?? "cattle");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(() => farmDayOf(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [account, setAccount] = useState<AccountTyped>(NO_ACCOUNT);
  const [heldBy, setHeldBy] = useState("");
  const [note, setNote] = useState("");
  const pay = useMutation(
    orpc.baki.pay.mutationOptions({
      onSuccess: () => {
        toast.success(t("baki.recorded"));
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
      description={t("baki.paymentDescription")}
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
            amountBdt: figure,
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
      submitLabel={t("baki.record")}
      title={t("baki.paymentTitle")}
    >
      <FormField id="baki-buyer" label={t("baki.buyer")}>
        <Input disabled id="baki-buyer" value={paying?.buyer ?? ""} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="baki-kind" label={t("baki.kind")}>
          <NativeSelect
            id="baki-kind"
            onChange={(event) =>
              setKind(
                BAKI_KINDS.find((one) => one === event.target.value) ?? "cattle"
              )
            }
            value={kind}
          >
            {BAKI_KINDS.map((one) => (
              <option key={one} value={one}>
                {t(one === "milk" ? "baki.kind.milk" : "baki.kind.cattle")}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="baki-amount" label={t("baki.amount")}>
          <Input
            autoComplete="off"
            id="baki-amount"
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
        <FormField id="baki-paid-on" label={t("baki.paidOn")}>
          <Input
            id="baki-paid-on"
            onChange={(event) => setPaidOn(event.target.value)}
            required
            type="date"
            value={paidOn}
          />
        </FormField>
        <PaymentMethodField
          account={{ typed: account, onChange: setAccount }}
          id="baki-paid-by"
          onChange={setPaymentMethod}
          value={paymentMethod}
        />
        {paymentMethod === "cash" ? (
          <WhoseHandField
            id="baki-whose-hand"
            onChange={setHeldBy}
            value={heldBy}
          />
        ) : null}
      </div>
      <FormField
        hint={t("baki.noteHint")}
        id="baki-note"
        label={t("baki.note")}
      >
        <Input
          autoComplete="off"
          id="baki-note"
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};

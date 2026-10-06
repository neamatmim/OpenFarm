import { useMutation } from "@tanstack/react-query";

import {
  CorrectionAnswer,
  CorrectionChoice,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { amount, day, figure, note, voiding, words } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

/** A Receivable Payment written up wrong — how much, the day it came, or the note — put right with the reason. Who paid and
 *  what for are not changed here: a payment written twice, against the wrong buyer or for the wrong kind is voided, and
 *  written again. */
export const ReceivablePaymentCorrection = ({
  payment,
}: {
  payment: {
    id: string;
    amountMoney: number;
    paidOn: string;
    note: string | null;
  };
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    amountMoney: amount(payment.amountMoney),
    paidOn: day(payment.paidOn),
    note: note(payment.note),
    voided: voiding(),
  });
  const correct = useMutation(
    orpc.receivables.correctPayment.mutationOptions({})
  );
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: payment.id,
          reason,
          changes: correcting.changes(),
        });
      }}
      ready={correcting.changed}
      title={t("correct.receivablePayment")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CorrectionAnswer
          inputMode="decimal"
          label={t("receivable.amount")}
          onChange={(value) => correcting.set("amountMoney", value)}
          type="number"
          value={correcting.typed.amountMoney ?? ""}
        />
        <CorrectionAnswer
          label={t("receivable.paidOn")}
          onChange={(value) => correcting.set("paidOn", value)}
          type="date"
          value={correcting.typed.paidOn ?? ""}
        />
      </div>
      <CorrectionAnswer
        label={t("receivable.note")}
        onChange={(value) => correcting.set("note", value)}
        value={correcting.typed.note ?? ""}
      />
      <CorrectionChoice
        label={t("correct.voidPaymentWhy")}
        onChange={(value) => correcting.set("voided", value)}
        options={[{ value: "void", label: t("correct.voidPayment") }]}
        unchosen={t("correct.keep")}
        value={correcting.typed.voided ?? ""}
      />
    </CorrectionDialog>
  );
};

/** A Write-off put right by the Owner — how much, or why — or taken back by setting it to nothing. */
export const WriteOffCorrection = ({
  writeOff,
}: {
  writeOff: { id: string; amountMoney: number; reason: string };
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    amountMoney: figure(writeOff.amountMoney),
    why: words(writeOff.reason),
  });
  const correct = useMutation(
    orpc.receivables.correctWriteOff.mutationOptions({})
  );
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: writeOff.id,
          reason,
          changes: correcting.changes(),
        });
      }}
      ready={correcting.changed}
      title={t("correct.writeOff")}
    >
      <CorrectionAnswer
        inputMode="decimal"
        label={t("receivable.amount")}
        onChange={(value) => correcting.set("amountMoney", value)}
        type="number"
        value={correcting.typed.amountMoney ?? ""}
      />
      <CorrectionAnswer
        label={t("receivable.writeOffWhy")}
        onChange={(value) => correcting.set("why", value)}
        value={correcting.typed.why ?? ""}
      />
    </CorrectionDialog>
  );
};

/** A buyer's phone put right, with why: a later Sale never overwrites the number the farm has, so a number that changed
 *  is changed here, and the old one stays on the trail. */
export const BuyerPhoneCorrection = ({
  buyer,
}: {
  buyer: { counterpartyId: string; phone: string | null };
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({ phone: words(buyer.phone ?? "") });
  const setPhone = useMutation(orpc.receivables.setPhone.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await setPhone.mutateAsync({
          counterpartyId: buyer.counterpartyId,
          phone: correcting.typed.phone ?? "",
          reason,
        });
      }}
      ready={correcting.changed}
      title={t("receivable.correctPhone")}
      trigger={t("receivable.correctPhone")}
    >
      <CorrectionAnswer
        inputMode="tel"
        label={t("sale.buyerPhone")}
        onChange={(value) => correcting.set("phone", value)}
        value={correcting.typed.phone ?? ""}
      />
    </CorrectionDialog>
  );
};

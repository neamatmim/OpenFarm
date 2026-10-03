import { useMutation } from "@tanstack/react-query";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { amount, day, figure, note, words } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

/** A Baki Payment written up wrong — how much, the day it came, or the note — put right with the reason. Who paid and
 *  what for are not changed here: a payment against the wrong buyer is taken back and written again. */
export const BakiPaymentCorrection = ({
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
  });
  const correct = useMutation(orpc.baki.correctPayment.mutationOptions({}));
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
      title={t("correct.bakiPayment")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CorrectionAnswer
          inputMode="decimal"
          label={t("baki.amount")}
          onChange={(value) => correcting.set("amountMoney", value)}
          type="number"
          value={correcting.typed.amountMoney ?? ""}
        />
        <CorrectionAnswer
          label={t("baki.paidOn")}
          onChange={(value) => correcting.set("paidOn", value)}
          type="date"
          value={correcting.typed.paidOn ?? ""}
        />
      </div>
      <CorrectionAnswer
        label={t("baki.note")}
        onChange={(value) => correcting.set("note", value)}
        value={correcting.typed.note ?? ""}
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
  const correct = useMutation(orpc.baki.correctWriteOff.mutationOptions({}));
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
        label={t("baki.amount")}
        onChange={(value) => correcting.set("amountMoney", value)}
        type="number"
        value={correcting.typed.amountMoney ?? ""}
      />
      <CorrectionAnswer
        label={t("baki.writeOffWhy")}
        onChange={(value) => correcting.set("why", value)}
        value={correcting.typed.why ?? ""}
      />
    </CorrectionDialog>
  );
};

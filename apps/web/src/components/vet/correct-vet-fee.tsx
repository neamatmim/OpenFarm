import { useMutation } from "@tanstack/react-query";

import {
  CorrectionAnswer,
  CorrectionChoice,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { amount, day, note, voiding } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

/**
 * A Vet Fee put right — how much, the day of the visit, the note — or voided, written twice or never charged. The Vet's
 * own in their window and the Owner's at any time; its money follows. The animals it was charged to stay as named.
 */
export const CorrectVetFee = ({
  fee,
}: {
  fee: {
    id: string;
    amountMoney: number;
    visitedOn: Date | string;
    /** Left out where the screen does not hold it — the money register — and the note is not offered there. */
    note?: string | null;
  };
}) => {
  const { t } = useLanguage();
  const withNote = fee.note !== undefined;
  const correcting = useCorrecting({
    amountMoney: amount(fee.amountMoney),
    visitedOn: day(fee.visitedOn),
    ...(withNote ? { note: note(fee.note ?? null) } : {}),
    voided: voiding(),
  });
  const correct = useMutation(orpc.money.correctVetFee.mutationOptions({}));
  return (
    <CorrectionDialog
      description={t("vetFee.correctHint")}
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: fee.id,
          changes: correcting.changes(),
          reason,
        });
      }}
      ready={correcting.changed}
      title={t("vetFee.correct")}
      trigger={t("vetFee.correct")}
    >
      <CorrectionAnswer
        inputMode="numeric"
        label={t("vetFee.amount")}
        onChange={(value) => correcting.set("amountMoney", value)}
        type="number"
        value={correcting.typed.amountMoney ?? ""}
      />
      <CorrectionAnswer
        label={t("vetFee.visitedOn")}
        onChange={(value) => correcting.set("visitedOn", value)}
        type="date"
        value={correcting.typed.visitedOn ?? ""}
      />
      {withNote ? (
        <CorrectionAnswer
          label={t("vetFee.note")}
          onChange={(value) => correcting.set("note", value)}
          value={correcting.typed.note ?? ""}
        />
      ) : null}
      <CorrectionChoice
        label={t("correct.voidWhy")}
        onChange={(value) => correcting.set("voided", value)}
        options={[{ value: "void", label: t("correct.voidIt") }]}
        unchosen={t("correct.keep")}
        value={correcting.typed.voided ?? ""}
      />
    </CorrectionDialog>
  );
};

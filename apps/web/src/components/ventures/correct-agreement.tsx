import { useMutation } from "@tanstack/react-query";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { STAMP_LABELS } from "@/components/ventures/sign-agreement-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { amount, day, words } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

/**
 * What was typed against the stamped paper put right — the Units, the stamp's value, day and serial, the Arbitrator —
 * the Owner's, until any capital is taken on it. 2 Units typed for 20 could only be undone by calling the whole Venture
 * off. The split and the Target Window are an Amendment's, signed by everybody.
 */
export const CorrectAgreement = ({
  agreement,
}: {
  agreement: {
    id: string;
    units: number;
    arbitrator: string;
    stamp: {
      /** Agreed in the app has no stamped paper, and nothing of a stamp to put right. */
      kind: string;
      valueMoney: number;
      on: string;
      serial: string;
    };
  };
}) => {
  const { t } = useLanguage();
  const { kind } = agreement.stamp;
  const labels =
    kind === "paper" || kind === "e_challan" ? STAMP_LABELS[kind] : null;
  const correcting = useCorrecting({
    units: amount(agreement.units),
    ...(labels
      ? {
          stampValueMoney: amount(agreement.stamp.valueMoney),
          stampedOn: day(agreement.stamp.on),
          stampSerial: words(agreement.stamp.serial),
        }
      : {}),
    arbitrator: words(agreement.arbitrator),
  });
  const correct = useMutation(
    orpc.ventures.agreements.correct.mutationOptions({})
  );
  return (
    <CorrectionDialog
      description={t("ventures.correctAgreementHint")}
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: agreement.id,
          changes: correcting.changes(),
          reason,
        });
      }}
      ready={correcting.changed}
      title={t("ventures.correctAgreement")}
      trigger={t("ventures.correctAgreement")}
    >
      <CorrectionAnswer
        inputMode="numeric"
        label={t("ventures.unitsTaken")}
        onChange={(value) => correcting.set("units", value)}
        type="number"
        value={correcting.typed.units ?? ""}
      />
      {labels ? (
        <>
          <CorrectionAnswer
            inputMode="numeric"
            label={t(labels.value)}
            onChange={(value) => correcting.set("stampValueMoney", value)}
            type="number"
            value={correcting.typed.stampValueMoney ?? ""}
          />
          <CorrectionAnswer
            label={t(labels.on)}
            onChange={(value) => correcting.set("stampedOn", value)}
            type="date"
            value={correcting.typed.stampedOn ?? ""}
          />
          <CorrectionAnswer
            label={t(labels.serial)}
            onChange={(value) => correcting.set("stampSerial", value)}
            value={correcting.typed.stampSerial ?? ""}
          />
        </>
      ) : null}
      <CorrectionAnswer
        label={t("ventures.arbitrator")}
        onChange={(value) => correcting.set("arbitrator", value)}
        value={correcting.typed.arbitrator ?? ""}
      />
    </CorrectionDialog>
  );
};

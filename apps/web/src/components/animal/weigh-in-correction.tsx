import { useMutation } from "@tanstack/react-query";

import {
  CorrectionAnswer,
  CorrectionChoice,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { figure, moment, voiding } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

/** A Weigh-in typed on her page, put right — the weight, the moment, or both — or taken off her record with the reason.
 *  A round's reading is put right on its Step, so only a typed one offers this. */
export const WeighInCorrection = ({
  reading,
}: {
  reading: { id: string; weightKg: number; weighedAt: Date | string };
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    weightKg: figure(reading.weightKg, 1),
    weighedAt: moment(reading.weighedAt),
    voided: voiding(),
  });
  const correct = useMutation(orpc.animals.correctWeighIn.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: reading.id,
          reason,
          changes: correcting.changes(),
        });
      }}
      ready={correcting.changed}
      title={t("weighIn.correct")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CorrectionAnswer
          label={t("weighIn.weighedAt")}
          onChange={(value) => correcting.set("weighedAt", value)}
          type="datetime-local"
          value={correcting.typed.weighedAt ?? ""}
        />
        <CorrectionAnswer
          inputMode="decimal"
          label={t("weighIn.weightKg")}
          onChange={(value) => correcting.set("weightKg", value)}
          type="number"
          value={correcting.typed.weightKg ?? ""}
        />
      </div>
      <CorrectionChoice
        label={t("weighIn.voidWhy")}
        onChange={(value) => correcting.set("voided", value)}
        options={[{ value: "void", label: t("weighIn.voidIt") }]}
        unchosen={t("correct.keep")}
        value={correcting.typed.voided ?? ""}
      />
    </CorrectionDialog>
  );
};

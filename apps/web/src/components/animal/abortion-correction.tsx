import { useMutation } from "@tanstack/react-query";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { day, figure, words } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

/** An abortion put right by the Vet — the day, how far along she was, or the note — with the reason. What it did to
 *  her pregnancy stands: one recorded against the wrong cow is a pregnancy to find again with a check. */
export const AbortionCorrection = ({
  abortion,
}: {
  abortion: {
    id: string;
    abortedAt: Date | string;
    stageMonths: number;
    note: string | null;
  };
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    abortedAt: day(abortion.abortedAt),
    stageMonths: figure(abortion.stageMonths, 1),
    note: words(abortion.note ?? ""),
  });
  const correct = useMutation(
    orpc.breeding.correctAbortion.mutationOptions({})
  );
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: abortion.id,
          reason,
          changes: correcting.changes(),
        });
      }}
      ready={correcting.changed}
      title={t("correct.abortion")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CorrectionAnswer
          label={t("abortion.when")}
          onChange={(value) => correcting.set("abortedAt", value)}
          type="date"
          value={correcting.typed.abortedAt ?? ""}
        />
        <CorrectionAnswer
          inputMode="numeric"
          label={t("abortion.stageMonths")}
          onChange={(value) => correcting.set("stageMonths", value)}
          type="number"
          value={correcting.typed.stageMonths ?? ""}
        />
      </div>
      <CorrectionAnswer
        label={t("abortion.note")}
        onChange={(value) => correcting.set("note", value)}
        value={correcting.typed.note ?? ""}
      />
    </CorrectionDialog>
  );
};

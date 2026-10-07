import { useMutation } from "@tanstack/react-query";

import {
  CorrectionChoice,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { voiding } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

/**
 * A record that is taken back rather than retyped — written against the wrong cow, written twice — with the reason the
 * dialog asks for kept in the trail. Written again as it really was, if it happened at all.
 */
export const TakeItBack = ({
  title,
  hint,
  choice,
  onSave,
}: {
  title: string;
  hint: string;
  /** What taking it back does, said on the one choice the dialog offers. */
  choice: string;
  onSave: (reason: string) => Promise<unknown>;
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({ taken: voiding() });
  return (
    <CorrectionDialog
      description={hint}
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await onSave(reason);
      }}
      ready={correcting.changed}
      title={title}
      trigger={title}
    >
      <CorrectionChoice
        label={t("correct.voidWhy")}
        onChange={(value) => correcting.set("taken", value)}
        options={[{ value: "void", label: choice }]}
        unchosen={t("correct.keep")}
        value={correcting.typed.taken ?? ""}
      />
    </CorrectionDialog>
  );
};

/** A dose not prescribed voided — the wrong cow, written twice — and her holds worked out again without it. The Owner's
 *  and the Manager's. */
export const VoidDoseNotPrescribed = ({ id }: { id: string }) => {
  const { t } = useLanguage();
  const correct = useMutation(
    orpc.treatments.correctNotPrescribed.mutationOptions({})
  );
  return (
    <TakeItBack
      choice={t("dose.voidIt")}
      hint={t("dose.voidHint")}
      onSave={(reason) =>
        correct.mutateAsync({
          id,
          reason,
          changes: { voided: { from: false, to: true } },
        })
      }
      title={t("dose.void")}
    />
  );
};

/** A sighting off the round withdrawn — the wrong cow, seen wrong — and the work it raised called off. */
export const WithdrawSighting = ({ id }: { id: string }) => {
  const { t } = useLanguage();
  const correct = useMutation(orpc.observations.withdraw.mutationOptions({}));
  return (
    <TakeItBack
      choice={t("observations.withdrawIt")}
      hint={t("observations.withdrawHint")}
      onSave={(reason) =>
        correct.mutateAsync({
          id,
          reason,
          changes: { withdrawn: { from: false, to: true } },
        })
      }
      title={t("observations.withdraw")}
    />
  );
};

/** A Lost write-off taken back — written against the wrong tag — the Owner's: she comes back as she was, and a Venture's
 *  animal stays the Venture's, the money she was made good with back with the Farm. */
export const VoidWriteOff = ({ tagNumber }: { tagNumber: string }) => {
  const { t } = useLanguage();
  const correct = useMutation(orpc.animals.voidWriteOff.mutationOptions({}));
  return (
    <TakeItBack
      choice={t("animals.voidWriteOffIt")}
      hint={t("animals.voidWriteOffHint")}
      onSave={(reason) => correct.mutateAsync({ tagNumber, reason })}
      title={t("animals.voidWriteOff")}
    />
  );
};

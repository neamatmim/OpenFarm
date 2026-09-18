import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { amount, day, words } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

/**
 * A movement of a Venture's money put right: what it says, not whether it happened.
 *
 * The Venture is asked again afterwards because almost everything it shows is read from its movements —
 * what the account holds, what each budget holds, what it owes the Owner.
 */
export const CorrectMovement = ({
  movement,
}: {
  movement: {
    id: string;
    amountBdt: number;
    movedOn: string;
    reference: string;
  };
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const correcting = useCorrecting({
    amountBdt: amount(movement.amountBdt),
    movedOn: day(movement.movedOn),
    reference: words(movement.reference),
  });
  const correct = useMutation(
    orpc.ventures.correctMovement.mutationOptions({})
  );
  return (
    <CorrectionDialog
      description={t("ventures.correctMovementHint")}
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: movement.id,
          changes: correcting.changes(),
          reason,
        });
        await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
      }}
      ready={correcting.changed}
      title={t("ventures.correctMovement")}
      trigger={t("ventures.correctMovement")}
    >
      <CorrectionAnswer
        inputMode="numeric"
        label={t("ventures.amount")}
        onChange={(value) => correcting.set("amountBdt", value)}
        type="number"
        value={correcting.typed.amountBdt ?? ""}
      />
      <CorrectionAnswer
        label={t("ventures.movedOn")}
        onChange={(value) => correcting.set("movedOn", value)}
        type="date"
        value={correcting.typed.movedOn ?? ""}
      />
      <CorrectionAnswer
        label={t("ventures.reference")}
        onChange={(value) => correcting.set("reference", value)}
        value={correcting.typed.reference ?? ""}
      />
    </CorrectionDialog>
  );
};

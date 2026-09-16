import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  CorrectionDialog,
  CorrectionAnswer,
  useCorrecting,
} from "@/components/correction-dialog";
import { useT } from "@/i18n/language-provider";
import { amount, counterparty } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

/**
 * A Sale put right: what she fetched, and who took her.
 *
 * One component, used from the sale screen and from her own page — the same Sale, and a person correcting it from
 * either place is correcting the one record. Which list is read again afterwards is the screen's own business.
 */
export const SaleCorrection = ({
  sale,
  thenReload,
}: {
  sale: { id: string; priceBdt: number; buyerName: string };
  /** The list this screen shows, read again once the farm has taken the Correction. */
  thenReload: readonly unknown[];
}) => {
  const t = useT();
  const queryClient = useQueryClient();
  const correcting = useCorrecting({
    priceBdt: amount(sale.priceBdt),
    buyer: counterparty(sale.buyerName),
  });
  const correct = useMutation(orpc.sale.correct.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: sale.id,
          reason,
          changes: correcting.changes(),
        });
        await queryClient.invalidateQueries({ queryKey: thenReload });
      }}
      ready={correcting.changed}
      title={t("correct.sale")}
    >
      <CorrectionAnswer
        inputMode="numeric"
        label={t("sale.price")}
        onChange={(value) => correcting.set("priceBdt", value)}
        type="number"
        value={correcting.typed.priceBdt ?? ""}
      />
      <CorrectionAnswer
        label={t("correct.buyer")}
        onChange={(value) => correcting.set("buyer", value)}
        value={correcting.typed.buyer ?? ""}
      />
    </CorrectionDialog>
  );
};

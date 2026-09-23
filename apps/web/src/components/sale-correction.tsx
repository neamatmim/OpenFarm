import { useMutation } from "@tanstack/react-query";

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
 * either place is correcting the one record, and whichever screen it is on is read again once the farm takes it.
 */
export const SaleCorrection = ({
  sale,
}: {
  sale: { id: string; priceBdt: number; buyerName: string };
}) => {
  const t = useT();
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

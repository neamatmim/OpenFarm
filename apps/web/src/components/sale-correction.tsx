import { paidAtTheGate } from "@OpenFarm/domain";
import { useMutation } from "@tanstack/react-query";

import {
  CorrectionDialog,
  CorrectionAnswer,
  useCorrecting,
} from "@/components/correction-dialog";
import { useT } from "@/i18n/language-provider";
import { amount, counterparty, day, figure } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

/**
 * A Sale put right: what she fetched, who took her, what he paid there and then, and the day he promised to pay the
 * rest by.
 *
 * One component, used from the sale screen and from her own page — the same Sale, and a person correcting it from
 * either place is correcting the one record, and whichever screen it is on is read again once the farm takes it.
 */
export const SaleCorrection = ({
  sale,
}: {
  sale: {
    id: string;
    priceBdt: number;
    buyerName: string;
    // Left out of an answer cached before Baki was written down: paid in full, as every such Sale was.
    bakiBdt?: number;
    promisedBy?: string | null;
  };
}) => {
  const t = useT();
  const correcting = useCorrecting({
    priceBdt: amount(sale.priceBdt),
    buyer: counterparty(sale.buyerName),
    paidNowBdt: figure(paidAtTheGate(sale.priceBdt, sale.bakiBdt ?? 0)),
    promisedBy: day(sale.promisedBy ?? null),
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
      <div className="grid gap-4 sm:grid-cols-2">
        <CorrectionAnswer
          inputMode="numeric"
          label={t("baki.paidNow")}
          onChange={(value) => correcting.set("paidNowBdt", value)}
          type="number"
          value={correcting.typed.paidNowBdt ?? ""}
        />
        <CorrectionAnswer
          label={t("baki.promisedBy")}
          onChange={(value) => correcting.set("promisedBy", value)}
          type="date"
          value={correcting.typed.promisedBy ?? ""}
        />
      </div>
    </CorrectionDialog>
  );
};

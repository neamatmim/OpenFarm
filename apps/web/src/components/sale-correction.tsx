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
 * A Sale put right: what she fetched, who took her, what he paid there and then, the day he promised to pay the
 * rest by, and what the broker took.
 *
 * One component, used from the sale screen and from her own page — the same Sale, and a person correcting it from
 * either place is correcting the one record, and whichever screen it is on is read again once the farm takes it.
 */
export const SaleCorrection = ({
  sale,
}: {
  sale: {
    id: string;
    priceMoney: number;
    buyerName: string;
    // Left out of an answer cached before Receivable was written down: paid in full, as every such Sale was.
    receivableMoney?: number;
    promisedBy?: string | null;
    // Left out of an answer cached before a broker was written on a Sale: none was.
    brokerMoney?: number;
    /** What she weighed on the day, which her Shrink and her price a kilo are read from. */
    weightKg: number;
  };
}) => {
  const t = useT();
  const correcting = useCorrecting({
    priceMoney: amount(sale.priceMoney),
    buyer: counterparty(sale.buyerName),
    paidNowMoney: figure(
      paidAtTheGate(sale.priceMoney, sale.receivableMoney ?? 0)
    ),
    promisedBy: day(sale.promisedBy ?? null),
    brokerMoney: figure(sale.brokerMoney ?? 0),
    weightKg: amount(Number(sale.weightKg)),
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
        onChange={(value) => correcting.set("priceMoney", value)}
        type="number"
        value={correcting.typed.priceMoney ?? ""}
      />
      <CorrectionAnswer
        inputMode="decimal"
        label={t("sale.weight")}
        onChange={(value) => correcting.set("weightKg", value)}
        type="number"
        value={correcting.typed.weightKg ?? ""}
      />
      <CorrectionAnswer
        label={t("correct.buyer")}
        onChange={(value) => correcting.set("buyer", value)}
        value={correcting.typed.buyer ?? ""}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <CorrectionAnswer
          inputMode="numeric"
          label={t("receivable.paidNow")}
          onChange={(value) => correcting.set("paidNowMoney", value)}
          type="number"
          value={correcting.typed.paidNowMoney ?? ""}
        />
        <CorrectionAnswer
          label={t("receivable.promisedBy")}
          onChange={(value) => correcting.set("promisedBy", value)}
          type="date"
          value={correcting.typed.promisedBy ?? ""}
        />
      </div>
      <CorrectionAnswer
        inputMode="numeric"
        label={t("sale.broker")}
        onChange={(value) => correcting.set("brokerMoney", value)}
        type="number"
        value={correcting.typed.brokerMoney ?? ""}
      />
    </CorrectionDialog>
  );
};

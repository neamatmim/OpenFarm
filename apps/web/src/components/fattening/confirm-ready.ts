import { formatDate } from "@OpenFarm/i18n";
import { useMutation } from "@tanstack/react-query";

import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import { fitOnFrom } from "./fattening-types";

/** A refusal about making her ready: under withdrawal, said with the day she is fit on; anything else in the farm's
 *  words, never the server's English. */
export const useReadyRefused = () => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  return (error: Error) => {
    const fitOn = fitOnFrom(error);
    if (fitOn) {
      toast.error(
        t("ready.underWithdrawal", {
          when: formatDate(new Date(fitOn), language, "date"),
        })
      );
      return;
    }
    refused(error);
  };
};

/**
 * The Manager's yes, that one being fattened is ready for sale — from the suggestions, her own page, the Fattening
 * board, or the sale sheet about to sell one never confirmed. One way in, so her Withdrawal is checked and her Pre-sale
 * check raised whichever page it was said on, and one set aside with "keep longer" is never a dead end.
 */
export const useConfirmReady = (onConfirmed?: (tagNumber: string) => void) => {
  const { t } = useLanguage();
  const onError = useReadyRefused();
  return useMutation(
    orpc.readyForSale.confirm.mutationOptions({
      onSuccess: ({ tagNumber }) => {
        toast.success(t("ready.confirmed", { tag: tagNumber }));
        onConfirmed?.(tagNumber);
      },
      onError,
    })
  );
};

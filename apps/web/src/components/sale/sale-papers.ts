import { useMutation } from "@tanstack/react-query";

import type { PaperId } from "@/components/paper";
import { useRefused } from "@/lib/refused";
import type { OwnWords } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** What only a sale's papers meet, said for what it stops: no transport card without the farm's registration. */
const PAPER_WORDS: OwnWords = {
  farm_identity_incomplete: "sale.missingRegistration",
};

/**
 * The two papers a Sale's buyer leaves with — the receipt and the transport card — asked for by the Sale, from the
 * day's list the morning she went or from her own page any day after. The paper comes back to whoever asked, to be
 * drawn where they are.
 */
export const useSalePapers = (onPaper: (id: PaperId, text: string) => void) => {
  // The one refusal these papers have their own words for — a transport card the office can use needs the farm's
  // registration — and the farm's own words for every other.
  const onError = useRefused(PAPER_WORDS);
  const receipt = useMutation(
    orpc.papers.receipt.mutationOptions({
      onSuccess: ({ text }) => onPaper("sale-receipt", text),
      onError,
    })
  );
  const card = useMutation(
    orpc.papers.transportCard.mutationOptions({
      onSuccess: ({ text }) => onPaper("transport-card", text),
      onError,
    })
  );
  return {
    askReceipt: (saleId: string) => receipt.mutate({ saleId }),
    askCard: (saleId: string) => card.mutate({ saleId }),
    busy: receipt.isPending || card.isPending,
  };
};

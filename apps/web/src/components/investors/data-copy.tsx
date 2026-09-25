import type { PaperDocument } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";

import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** Why the farm would not make the copy, in the Owner's words. */
const REFUSALS = {
  notice_unwritten: "investors.dataCopyNoticeUnwritten",
} as const;

/**
 * The Data Copy, «খামারে আপনার তথ্য»: everything the farm holds on one Investor, made from their page to answer a
 * written request for a copy, and printed to hand over. Made as it is asked for — an Export each time — and never kept
 * on the device: it is the one place their record leaves the server unmasked.
 */
export const DataCopyAct = ({
  investorId,
  name,
}: {
  investorId: string;
  name: string;
}) => {
  const { t } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [copy, setCopy] = useState<PaperDocument | null>(null);
  const making = useMutation(
    orpc.investors.dataCopy.mutationOptions({
      onError: refused,
      onSuccess: ({ document }) => setCopy(document),
    })
  );
  return (
    <>
      <Button
        disabled={making.isPending}
        onClick={() => making.mutate({ id: investorId })}
        type="button"
        variant="outline"
      >
        {making.isPending ? (
          <Spinner />
        ) : (
          <FileText aria-hidden data-icon="inline-start" />
        )}
        {t("investors.dataCopy")}
      </Button>
      <PaperDialog
        description={t("investors.dataCopyHint")}
        onClose={() => setCopy(null)}
        paper={copy}
        title={t("investors.dataCopyTitle", { name })}
        wording={null}
      />
    </>
  );
};

import { useMutation } from "@tanstack/react-query";

import { UploadButton } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { photoProblem, shrink } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/**
 * The photograph of an Agreement's stamped paper, taken for one signed without it — the thing capital may not be
 * taken against until the farm holds it. A button that opens the camera and keeps what it takes, wherever the
 * missing paper is noticed: in that Investor's row, or in the capital sheet that turned him away.
 */
export const AgreementPaperButton = ({
  agreementId,
  idPrefix,
}: {
  agreementId: string;
  /** Where it is drawn, so two of them on one screen do not share an id. */
  idPrefix: string;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const keeping = useMutation(
    orpc.ventures.agreements.keepPaper.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("ventures.paperKept"));
      },
    })
  );
  const id = `${idPrefix}-paper-${agreementId}`;
  return (
    <UploadButton
      busy={keeping.isPending}
      id={id}
      label={t("ventures.paperTake")}
      onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
          return;
        }
        try {
          keeping.mutate({ agreementId, ...(await shrink(file)) });
        } catch (error) {
          toast.error(t(photoProblem(error)));
        }
      }}
    />
  );
};

import { useMutation } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import { shrink } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
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
    orpc.ventures.keepAgreementPaper.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("ventures.paperKept"));
      },
    })
  );
  const id = `${idPrefix}-paper-${agreementId}`;
  return (
    <>
      {/* The farm's own words on the button, as everywhere else a photograph is taken. */}
      <label
        className="border-input bg-card hover:bg-muted has-[:focus-visible]:ring-ring/50 flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium whitespace-nowrap transition-colors has-[:focus-visible]:ring-[3px] md:min-h-8"
        htmlFor={id}
      >
        <Camera aria-hidden className="size-4" />
        {t("ventures.paperTake")}
      </label>
      <input
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={keeping.isPending}
        id={id}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          try {
            keeping.mutate({ agreementId, ...(await shrink(file)) });
          } catch {
            toast.error(t("common.error"));
          }
        }}
        type="file"
      />
    </>
  );
};

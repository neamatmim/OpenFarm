import { useMutation } from "@tanstack/react-query";
import { Camera } from "lucide-react";

import { useLanguage } from "@/i18n/language-provider";
import { photoProblem, shrink } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/**
 * The photograph of a signed মনোনয়নপত্র, taken for one recorded without it: a button that opens the camera and keeps
 * what it takes, as an Agreement's stamped paper is kept after signing.
 */
export const NominationPaperButton = ({
  nominationId,
}: {
  nominationId: string;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const keeping = useMutation(
    orpc.investors.keepNominationPaper.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("nominees.photoKeptNow"));
      },
    })
  );
  const id = `nomination-paper-${nominationId}`;
  return (
    <>
      {/* The farm's own words on the button, as everywhere else a photograph is taken. */}
      <label
        className="border-input bg-card hover:bg-muted has-[:focus-visible]:ring-ring flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium whitespace-nowrap transition-colors has-[:focus-visible]:ring-2 md:min-h-8"
        htmlFor={id}
      >
        <Camera aria-hidden className="size-4" />
        {t("nominees.keepPhoto")}
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
            keeping.mutate({ nominationId, ...(await shrink(file)) });
          } catch (error) {
            toast.error(t(photoProblem(error)));
          }
        }}
        type="file"
      />
    </>
  );
};

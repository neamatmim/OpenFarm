import type { MessageKey } from "@OpenFarm/i18n";
import { CircleCheck } from "lucide-react";

import { UploadButton } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import type { Photo } from "@/lib/photo";
import { photoProblem, shrink } from "@/lib/photo";
import { toast } from "@/lib/toast";

/**
 * Taking a photograph, in the farm's own words.
 *
 * The browser's own file button speaks the browser's language — a person reading the app in Bangla
 * gets "Choose file", "No file chosen" — and says nothing afterwards about whether a photo is on. Four
 * screens had written their own way round that and three had not, so this is the one way round it.
 *
 * The input keeps `capture="environment"`, which is what makes a phone open its camera rather than a
 * file browser: almost every one of these is a photograph somebody takes standing in front of the thing. The one
 * that is not — a screenshot of a transfer — says so with `fromCamera`.
 */
export const PhotoField = ({
  id,
  chosen,
  onPhoto,
  takeLabel,
  disabled = false,
  fromCamera = true,
}: {
  id: string;
  /** Whether a photo is on, so the line beside the button can say so. */
  chosen: boolean;
  onPhoto: (photo: Photo | null) => void;
  /** What the button says. The words differ — a stamped paper, a receipt, a certificate. */
  takeLabel: MessageKey;
  disabled?: boolean;
  /** False for a picture somebody already has — a screenshot of a transfer — which a phone told to open its camera
   *  would not let them choose. */
  fromCamera?: boolean;
}) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <UploadButton
        disabled={disabled}
        fromCamera={fromCamera}
        id={id}
        label={t(takeLabel)}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            onPhoto(null);
            return;
          }
          try {
            onPhoto(await shrink(file));
          } catch (error) {
            toast.error(t(photoProblem(error)));
          }
        }}
      />
      <p className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-sm">
        {chosen ? (
          <CircleCheck aria-hidden className="text-success size-4 shrink-0" />
        ) : null}
        <span className="truncate">
          {chosen ? t("photo.added") : t("photo.none")}
        </span>
      </p>
    </div>
  );
};

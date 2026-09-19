import type { MessageKey } from "@OpenFarm/i18n";
import { Camera, CircleCheck } from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import type { Photo } from "@/lib/photo";
import { shrink } from "@/lib/photo";

/**
 * Taking a photograph, in the farm's own words.
 *
 * The browser's own file button speaks the browser's language — a person reading the app in Bangla
 * gets "Choose file", "No file chosen" — and says nothing afterwards about whether a photo is on. Four
 * screens had written their own way round that and three had not, so this is the one way round it.
 *
 * The input keeps `capture="environment"`, which is what makes a phone open its camera rather than a
 * file browser: every one of these is a photograph somebody takes standing in front of the thing.
 */
export const PhotoField = ({
  id,
  chosen,
  onPhoto,
  takeLabel,
  disabled = false,
}: {
  id: string;
  /** Whether a photo is on, so the line beside the button can say so. */
  chosen: boolean;
  onPhoto: (photo: Photo | null) => void;
  /** What the button says. The words differ — a stamped paper, a receipt, a certificate. */
  takeLabel: MessageKey;
  disabled?: boolean;
}) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label
        className="border-input bg-card hover:bg-muted has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:border-ring flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors has-[:focus-visible]:ring-[3px] md:min-h-9"
        htmlFor={id}
      >
        <Camera aria-hidden className="size-4" />
        {t(takeLabel)}
      </label>
      <p className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-sm">
        {chosen ? (
          <CircleCheck aria-hidden className="text-success size-4 shrink-0" />
        ) : null}
        <span className="truncate">
          {chosen ? t("photo.added") : t("photo.none")}
        </span>
      </p>
      <input
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        id={id}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            onPhoto(null);
            return;
          }
          try {
            onPhoto(await shrink(file));
          } catch {
            toast.error(t("common.error"));
          }
        }}
        type="file"
      />
    </div>
  );
};

import { Button, buttonVariants } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { useMutation } from "@tanstack/react-query";
import { Download, Image } from "lucide-react";
import { useState } from "react";

import { UploadButton } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { photoProblem, shrink } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type KeptPhoto = Awaited<ReturnType<typeof client.investors.nominationPhoto>>;

/**
 * The photograph of a signed মনোনয়নপত্র: a button that opens the camera and keeps what it takes — for one recorded
 * without it, as an Agreement's stamped paper is kept after signing, or in place of a photo kept before.
 */
export const NominationPaperButton = ({
  nominationId,
  replacing = false,
  onKept,
}: {
  nominationId: string;
  /** Said as replacing the photo kept, rather than keeping a first one. */
  replacing?: boolean;
  onKept?: () => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const keeping = useMutation(
    orpc.investors.keepNominationPaper.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("nominees.photoKeptNow"));
        onKept?.();
      },
    })
  );
  const id = `nomination-paper-${replacing ? "again-" : ""}${nominationId}`;
  return (
    <UploadButton
      busy={keeping.isPending}
      id={id}
      label={t(replacing ? "nominees.replacePhoto" : "nominees.keepPhoto")}
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
    />
  );
};

/**
 * The photo of a signed মনোনয়নপত্র as the farm kept it: opened from its line, to look at or save, and replaced from
 * there with a better one — the new photo shown in its place once kept.
 */
export const NominationPhotoButton = ({
  nominationId,
}: {
  nominationId: string;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [photo, setPhoto] = useState<KeptPhoto>(null);
  const opening = useMutation(
    orpc.investors.nominationPhoto.mutationOptions({
      onError: refused,
      onSuccess: setPhoto,
    })
  );
  const source = photo ? `data:${photo.contentType};base64,${photo.data}` : "";
  return (
    <>
      <Button
        disabled={opening.isPending}
        onClick={() => opening.mutate({ nominationId })}
        size="sm"
        type="button"
        variant="outline"
      >
        <Image aria-hidden data-icon="inline-start" />
        {t("nominees.seePhoto")}
      </Button>
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPhoto(null);
          }
        }}
        open={photo !== null}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
          closeLabel={t("common.close")}
        >
          <DialogHeader>
            <DialogTitle>{t("nominees.photoTitle")}</DialogTitle>
            <DialogDescription>
              {t("nominees.photoDialogHint")}
            </DialogDescription>
          </DialogHeader>
          <img
            alt={t("nominees.photoTitle")}
            className="mx-auto max-h-[70vh] w-auto rounded-md border"
            src={source}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <NominationPaperButton
              nominationId={nominationId}
              onKept={() => opening.mutate({ nominationId })}
              replacing
            />
            <a
              className={buttonVariants({ variant: "outline" })}
              download={`nomination-paper.${photo?.contentType.split("/")[1] ?? "jpg"}`}
              href={source}
            >
              <Download aria-hidden data-icon="inline-start" />
              {t("statements.download")}
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

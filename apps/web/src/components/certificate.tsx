import { formatDate } from "@OpenFarm/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";

import { Section, StatusBadge } from "@/components/page";
import { UploadButton } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { photoProblem, shrink } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/**
 * The photograph of the farm's DLS Registration certificate: shown when there is one, and taken again when
 * the certificate is renewed or the old photograph will not read. The photograph is kept the moment it is taken;
 * there is nothing else to save.
 */
export const Certificate = ({
  id,
  updatedAt,
}: {
  id?: string;
  updatedAt: Date | null;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const photo = useQuery({
    ...orpc.farm.certificate.queryOptions(),
    enabled: updatedAt !== null,
  });
  const take = useMutation(
    orpc.farm.setCertificate.mutationOptions({
      onSuccess: () => {
        toast.success(t("certificate.taken"));
      },
      onError: refused,
    })
  );
  return (
    <Section
      action={
        updatedAt ? (
          <StatusBadge tone="success">
            {t("certificate.takenOn", {
              date: formatDate(updatedAt, language, "date"),
            })}
          </StatusBadge>
        ) : null
      }
      className="scroll-mt-6"
      description={t("certificate.hint")}
      id={id}
      title={t("certificate.title")}
    >
      {updatedAt && photo.data ? (
        <img
          alt={t("certificate.title")}
          className="bg-muted/40 max-h-96 w-full rounded-lg border object-contain"
          src={`data:${photo.data.contentType};base64,${photo.data.data}`}
        />
      ) : (
        <div className="text-muted-foreground bg-muted/40 flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          <ImageOff aria-hidden className="size-6" />
          {t("certificate.none")}
        </div>
      )}
      <div className="flex justify-end border-t pt-4">
        <UploadButton
          busy={take.isPending}
          id="certificate-photo"
          label={t("certificate.take")}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            try {
              take.mutate(await shrink(file));
            } catch (error) {
              toast.error(t(photoProblem(error)));
            }
          }}
          primary
        />
      </div>
    </Section>
  );
};

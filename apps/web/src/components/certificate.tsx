import { formatDate } from "@OpenFarm/i18n";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, ImageOff } from "lucide-react";
import { toast } from "sonner";

import { Section, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { shrink } from "@/lib/photo";
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
  const photo = useQuery({
    ...orpc.farm.certificate.queryOptions(),
    enabled: updatedAt !== null,
  });
  const take = useMutation(
    orpc.farm.setCertificate.mutationOptions({
      onSuccess: () => {
        toast.success(t("certificate.taken"));
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
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
        {/* The camera's own picker behind a button: the input stays in reach of the keyboard and a screen reader. */}
        <label
          className="bg-primary text-primary-foreground hover:bg-primary/90 has-[:focus-visible]:ring-ring inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-4 text-sm font-medium shadow-xs has-[:disabled]:opacity-50 has-[:focus-visible]:ring-3 md:h-9 md:px-3.5"
          htmlFor="certificate-photo"
        >
          {take.isPending ? (
            <Spinner />
          ) : (
            <Camera aria-hidden className="size-4" />
          )}
          {t("certificate.take")}
          <input
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={take.isPending}
            id="certificate-photo"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                take.mutate(await shrink(file));
              }
            }}
            type="file"
          />
        </label>
      </div>
    </Section>
  );
};

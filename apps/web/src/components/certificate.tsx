import { formatDate } from "@OpenFarm/i18n";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { shrink } from "@/lib/photo";
import { orpc } from "@/utils/orpc";

/**
 * The photograph of the farm's DLS Registration certificate: shown when there is one, and taken again when
 * the certificate is renewed or the old photograph will not read.
 */
export const Certificate = ({ updatedAt }: { updatedAt: Date | null }) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const photo = useQuery({
    ...orpc.farm.certificate.queryOptions(),
    enabled: updatedAt !== null,
  });
  const take = useMutation(
    orpc.farm.setCertificate.mutationOptions({
      onSuccess: async () => {
        toast.success(t("certificate.taken"));
        await queryClient.invalidateQueries({ queryKey: orpc.farm.key() });
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("certificate.title")}</h2>
      {updatedAt && photo.data ? (
        <>
          <img
            alt={t("certificate.title")}
            className="max-h-96 rounded-lg"
            src={`data:${photo.data.contentType};base64,${photo.data.data}`}
          />
          <p className="text-muted-foreground text-xs">
            {t("certificate.takenOn", {
              date: formatDate(updatedAt, language, "date"),
            })}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("certificate.none")}</p>
      )}
      <div className="space-y-1">
        <Label htmlFor="certificate-photo">{t("certificate.take")}</Label>
        <input
          accept="image/*"
          capture="environment"
          className="text-sm"
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
      </div>
    </section>
  );
};

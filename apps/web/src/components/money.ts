import type { Language } from "@OpenFarm/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import { correctionRefusalMessage } from "@/lib/correction-refusal";
import { orpc } from "@/utils/orpc";

/** A Category in the reader's language, Bangla when it has no English. */
export const categoryName = (
  category: { categoryBn: string; categoryEn: string | null },
  language: Language
): string =>
  language === "bn"
    ? category.categoryBn
    : (category.categoryEn ?? category.categoryBn);

/** Whether the person reading holds a Role money is shown to: the Owner or the Manager. */
export const useReadsMoney = (): boolean => {
  const me = useQuery(orpc.people.me.queryOptions());
  return (
    me.data?.roles.some((role) => role === "owner" || role === "manager") ??
    false
  );
};

/** Shows a refused money write in the reader's words where the farm has them. */
export const useRefusalToast = () => {
  const { t } = useLanguage();
  return (error: Error) =>
    toast.error(
      correctionRefusalMessage(error, t) ?? (error.message || t("common.error"))
    );
};

/** The Owner approving a Money Event at the terms they read, wherever they read it. */
export const useApproveMoney = () => {
  const onRefused = useRefusalToast();
  const queryClient = useQueryClient();
  return useMutation(
    orpc.money.approve.mutationOptions({
      onSuccess: () =>
        Promise.all(
          [orpc.money.key(), orpc.home.key(), orpc.alerts.key()].map((key) =>
            queryClient.invalidateQueries({ queryKey: key })
          )
        ),
      onError: async (error) => {
        onRefused(error);
        // Corrected or approved since it was read: show what it says now.
        await queryClient.invalidateQueries({ queryKey: orpc.home.key() });
      },
    })
  );
};

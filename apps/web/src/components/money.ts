import type { Language } from "@OpenFarm/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { orpc } from "@/utils/orpc";

/** A Category in the reader's language, Bangla when it has no English. */
export const categoryName = (
  category: { categoryBn: string; categoryEn: string | null },
  language: Language
): string =>
  language === "bn"
    ? category.categoryBn
    : (category.categoryEn ?? category.categoryBn);

/** The Owner approving a Money Event at the amount they read, wherever they read it. */
export const useApproveMoney = () => {
  const { t } = useLanguage();
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
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        );
        // Corrected or approved since it was read: show what it says now.
        await queryClient.invalidateQueries({ queryKey: orpc.home.key() });
      },
    })
  );
};

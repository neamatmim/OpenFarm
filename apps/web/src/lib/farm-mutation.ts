import type { MessageKey } from "@OpenFarm/i18n";
import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import type { OwnWords } from "@/lib/saying";
import { sayWhy } from "@/lib/saying";

// Telling the farm something, from a phone. Every one of these can be refused — a window that has closed, work that is
// somebody else's, an entry the world moved past — and every refusal is said in the reader's own language. One way of
// making them, so no screen has to remember that.

/**
 * A mutation the farm answers, wired the way every screen needs it: what to say when it is taken, what to read again
 * afterwards, and why in the reader's own language when it is not.
 */
export const useFarmMutation = <Answer, Asked>(
  options: UseMutationOptions<Answer, Error, Asked>,
  {
    saying,
    thenReload = [],
    ownWords,
    onRefused,
  }: {
    /** What to say when the farm takes it. Nothing said for the ones whose own screen says it. */
    saying?: MessageKey;
    /** The lists this changes, read again once the farm has taken it. */
    thenReload?: readonly (readonly unknown[])[];
    /** This screen's own words for the refusals only it can meet. */
    ownWords?: OwnWords;
    /** Anything else the screen does with a refusal — closing a form, reading a record again. */
    onRefused?: (error: Error) => void;
  } = {}
) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  return useMutation({
    ...options,
    onSuccess: async (
      ...args: Parameters<
        NonNullable<UseMutationOptions<Answer, Error, Asked>["onSuccess"]>
      >
    ) => {
      if (saying) {
        toast.success(t(saying));
      }
      await Promise.all(
        thenReload.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      );
      return await options.onSuccess?.(...args);
    },
    onError: (error: Error) => {
      toast.error(sayWhy(error, t, ownWords));
      onRefused?.(error);
    },
  });
};

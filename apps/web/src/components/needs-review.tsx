import type { ReviewReason } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** Every reason has something to say, typed by the reason rather than by string, so a new
 *  one is a compile error here rather than a row that renders as its own name. */
const REASON_MESSAGE: Record<ReviewReason, MessageKey> = {
  corrected_after_sign_off: "review.corrected_after_sign_off",
  irreversible_effect: "review.irreversible_effect",
  late_entry: "review.late_entry",
  sync_gap: "review.sync_gap",
  clock_skew: "review.clock_skew",
};

const messageFor = (reason: string): MessageKey | null =>
  (REASON_MESSAGE as Record<string, MessageKey>)[reason] ?? null;

/** What the system could not put right on its own. Closing one is a judgement, so it asks
 *  for the judgement rather than offering a tick. */
export const NeedsReview = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const queue = useQuery(orpc.review.open.queryOptions());
  const resolve = useMutation(
    orpc.review.resolve.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.review.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.alerts.key() });
      },
      onError: (error: Error) =>
        toast.error(error.message || t("common.error")),
    })
  );

  const note = (id: string) => notes[id] ?? "";

  return (
    <Section title={t("review.title")}>
      {queue.data?.length ? (
        <ul className="space-y-3">
          {queue.data.map((row) => {
            const key = messageFor(row.reason);
            return (
              <li className="rounded-lg border p-4" key={row.id}>
                <p className="font-bold">{key ? t(key) : row.reason}</p>
                <p className="text-muted-foreground text-sm">
                  {formatDate(new Date(row.raisedAt), language, "dateTime")}
                  {row.raisedBy.reason ? ` · ${row.raisedBy.reason}` : ""}
                </p>
                <div className="mt-3 space-y-2">
                  <Input
                    aria-label={t("review.resolution")}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [row.id]: event.target.value,
                      }))
                    }
                    placeholder={t("review.resolution")}
                    value={note(row.id)}
                  />
                  <Button
                    className="w-full"
                    disabled={!note(row.id).trim()}
                    onClick={() =>
                      resolve.mutate({
                        id: row.id,
                        resolution: note(row.id).trim(),
                      })
                    }
                    variant="outline"
                  >
                    {t("review.resolve")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={t("review.none")} />
      )}
    </Section>
  );
};

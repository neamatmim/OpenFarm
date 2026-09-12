import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { useLanguage } from "@/i18n/language-provider";
import type { Held, OutboxEntry } from "@/lib/outbox";
import { phoneOutbox } from "@/lib/outbox-client";

/** What the person actually typed, so they can see it and put it in again. */
const entered = (entry: OutboxEntry): string => {
  const body = entry.body as { evidence?: unknown[]; skipReason?: string };
  if (body.skipReason) {
    return String(body.skipReason);
  }
  return (body.evidence ?? []).map(String).join(", ");
};

const HeldList = ({
  rows,
  emptyKey,
  onDiscard,
}: {
  rows: Held[];
  emptyKey: "outbox.heldNone" | "outbox.reviewedNone";
  onDiscard: (id: string) => void;
}) => {
  const { t } = useLanguage();
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{t(emptyKey)}</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map(({ entry, reason }) => (
        <li className="rounded-2xl bg-neutral-900 p-4" key={entry.id}>
          <p className="font-bold">{reason}</p>
          <p className="text-muted-foreground text-sm">
            {t("outbox.entered")}: {entered(entry) || entry.kind}
          </p>
          <Button
            className="mt-3 w-full"
            onClick={() => onDiscard(entry.id)}
            variant="outline"
          >
            {t("outbox.discard")}
          </Button>
        </li>
      ))}
    </ul>
  );
};

/**
 * Everything this phone is still carrying: what the farm sent back, with the figures the
 * person entered so they can be put in again, and what the farm took but put in front of
 * somebody. Nothing leaves the phone until the person says it may.
 */
const OutboxPage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const held = useQuery({
    queryKey: ["outbox", "held"],
    queryFn: async () => {
      const outbox = phoneOutbox();
      const [rejected, reviewed] = await Promise.all([
        outbox?.rejected() ?? [],
        outbox?.reviewed() ?? [],
      ]);
      return { rejected, reviewed };
    },
  });
  const discard = useMutation({
    mutationFn: async (id: string) => {
      await phoneOutbox()?.discard(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["outbox"] });
    },
  });

  return (
    <div className="container mx-auto max-w-xl space-y-8 px-4 py-6">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">{t("outbox.heldTitle")}</h1>
        <HeldList
          emptyKey="outbox.heldNone"
          onDiscard={(id) => discard.mutate(id)}
          rows={held.data?.rejected ?? []}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">{t("outbox.reviewedTitle")}</h2>
        <HeldList
          emptyKey="outbox.reviewedNone"
          onDiscard={(id) => discard.mutate(id)}
          rows={held.data?.reviewed ?? []}
        />
      </section>
    </div>
  );
};

export const Route = createFileRoute("/_auth/outbox")({
  component: OutboxPage,
});

import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, Page, PageHeader, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { entryRefusalMessage } from "@/lib/correction-refusal";
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
    return <EmptyState bare title={t(emptyKey)} />;
  }
  return (
    <ul className="space-y-3">
      {rows.map(({ entry, reason, refusal }) => (
        <li className="rounded-lg border p-4" key={entry.id}>
          <p className="font-semibold">
            {entryRefusalMessage(refusal, t) ?? reason}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("outbox.entered")}: {entered(entry) || entry.kind}
          </p>
          <Button
            className="mt-3 w-full sm:w-auto"
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
    <Page width="narrow">
      <PageHeader title={t("outbox.heldTitle")} />
      <Section>
        <HeldList
          emptyKey="outbox.heldNone"
          onDiscard={(id) => discard.mutate(id)}
          rows={held.data?.rejected ?? []}
        />
      </Section>
      <Section title={t("outbox.reviewedTitle")}>
        <HeldList
          emptyKey="outbox.reviewedNone"
          onDiscard={(id) => discard.mutate(id)}
          rows={held.data?.reviewed ?? []}
        />
      </Section>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/outbox")({
  component: OutboxPage,
});

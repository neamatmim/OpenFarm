import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Eye, Undo2 } from "lucide-react";

import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
  TagChip,
} from "@/components/page";
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

/** The animal an entry was about, when it named one. */
const animalOf = (entry: OutboxEntry): string | undefined => {
  const body = entry.body as { animalTag?: string };
  return body.animalTag || undefined;
};

/** One entry the phone is still holding: why, what was entered and when, and the one thing to do with it. */
const HeldCard = ({
  held: { entry, reason, refusal },
  tone,
  onDiscard,
}: {
  held: Held;
  tone: "danger" | "info";
  onDiscard: (id: string) => void;
}) => {
  const { t, language } = useLanguage();
  const tag = animalOf(entry);
  const recordedAt = new Date(entry.recordedAt);
  const Icon = tone === "danger" ? Undo2 : Eye;
  return (
    <li className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            tone === "danger"
              ? "bg-danger-surface text-danger"
              : "bg-info-surface text-info"
          )}
        >
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-semibold">
            {entryRefusalMessage(refusal, t) ?? reason}
          </p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {tag ? <TagChip>{tag}</TagChip> : null}
            {Number.isNaN(recordedAt.getTime()) ? null : (
              <span>{formatDate(recordedAt, language, "dateTime")}</span>
            )}
          </div>
        </div>
      </div>
      <div className="bg-muted/60 rounded-lg px-3 py-2 text-sm">
        <p className="text-muted-foreground text-xs font-medium">
          {t("outbox.entered")}
        </p>
        <p className="font-medium break-words">
          {entered(entry) || entry.kind}
        </p>
      </div>
      <Button
        className="h-12 w-full sm:h-9 sm:w-auto sm:self-end"
        onClick={() => onDiscard(entry.id)}
        variant="outline"
      >
        <Check data-icon="inline-start" />
        {t("outbox.discard")}
      </Button>
    </li>
  );
};

const HeldList = ({
  rows,
  emptyKey,
  tone,
  onDiscard,
}: {
  rows: Held[];
  emptyKey: "outbox.heldNone" | "outbox.reviewedNone";
  tone: "danger" | "info";
  onDiscard: (id: string) => void;
}) => {
  const { t } = useLanguage();
  if (rows.length === 0) {
    return <EmptyState title={t(emptyKey)} />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((held) => (
        <HeldCard
          held={held}
          key={held.entry.id}
          onDiscard={onDiscard}
          tone={tone}
        />
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
      <PageHeader
        description={t("outbox.heldHint")}
        title={t("outbox.heldTitle")}
      />
      <Loaded query={held}>
        <Section plain>
          <HeldList
            emptyKey="outbox.heldNone"
            onDiscard={(id) => discard.mutate(id)}
            rows={held.data?.rejected ?? []}
            tone="danger"
          />
        </Section>
        <Section
          description={t("outbox.reviewedHint")}
          plain
          title={t("outbox.reviewedTitle")}
        >
          <HeldList
            emptyKey="outbox.reviewedNone"
            onDiscard={(id) => discard.mutate(id)}
            rows={held.data?.reviewed ?? []}
            tone="info"
          />
        </Section>
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/outbox")({
  component: OutboxPage,
});

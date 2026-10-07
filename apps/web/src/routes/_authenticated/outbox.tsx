import { OBSERVATION_WORDS } from "@OpenFarm/domain";
import type { Language, MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
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

/** What each kind of entry is called, so one with nothing typed in it still says what it was. */
const KIND_WORD: Record<OutboxEntry["kind"], MessageKey> = {
  step_completion: "review.held.step_completion",
  completion_photo: "review.held.completion_photo",
  instance_claim: "review.held.instance_claim",
  instance_complete: "review.held.instance_complete",
  animal_move: "review.held.animal_move",
  observation: "review.held.observation",
  step_correction: "review.held.step_correction",
};

/** What the person actually typed, so they can see it and put it in again: figures in the reader's own digits, a yes
 *  tick in words, what was seen of an animal, and the reason a Step was skipped. */
const entered = (
  entry: OutboxEntry,
  t: (key: MessageKey) => string,
  language: Language
): string => {
  const body = entry.body as {
    evidence?: unknown[];
    skipReason?: string;
    saw?: string;
    note?: string;
  };
  if (body.skipReason) {
    return String(body.skipReason);
  }
  const said = (body.evidence ?? []).map((value) => {
    if (typeof value === "number") {
      return formatNumber(value, language);
    }
    if (typeof value === "boolean") {
      return t(value ? "outbox.ticked" : "outbox.notTicked");
    }
    return String(value);
  });
  // What was seen, in the reader's words for it rather than the farm's code word.
  const seen = OBSERVATION_WORDS.find((word) => word.value === body.saw);
  const seenSaid = language === "en" ? seen?.en : seen?.bn;
  const saw = seenSaid ?? body.saw;
  return [...said, saw, body.note].filter(Boolean).join(", ");
};

/** The animal an entry was about, when it named one: a Step and a photo by `animalTag`, a Move and a sighting by
 *  `tagNumber`. */
const animalOf = (entry: OutboxEntry): string | undefined => {
  const body = entry.body as { animalTag?: string; tagNumber?: string };
  return body.animalTag || body.tagNumber || undefined;
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
    <li className="surface flex flex-col gap-3 p-4">
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
          {entered(entry, t, language) || t(KIND_WORD[entry.kind])}
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
    <Page>
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

export const Route = createFileRoute("/_authenticated/outbox")({
  component: OutboxPage,
});

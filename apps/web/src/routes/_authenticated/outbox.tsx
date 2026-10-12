import type { SopContent } from "@OpenFarm/domain";
import { OBSERVATION_WORDS, choiceSaid } from "@OpenFarm/domain";
import type { Language, MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, ListX, Undo2 } from "lucide-react";
import { useState } from "react";

import { RecoverEntry } from "@/components/outbox/recover-entry";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
  TagChip,
} from "@/components/page";
import { ConfirmDialog } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { entryRefusalMessage } from "@/lib/correction-refusal";
import type { Held, OutboxEntry } from "@/lib/outbox";
import { phoneOutbox } from "@/lib/outbox-client";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

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
  language: Language,
  /** The Version the Step was answered on, as this phone last had its work: what its choices are called. */
  content?: SopContent
): string => {
  const body = entry.body as {
    evidence?: unknown[];
    skipReason?: string;
    saw?: string;
    note?: string;
    stepId?: string;
  };
  if (body.skipReason) {
    return String(body.skipReason);
  }
  const said = (body.evidence ?? []).map((value, slot) => {
    if (typeof value === "number") {
      return formatNumber(value, language);
    }
    if (typeof value === "boolean") {
      return t(value ? "outbox.ticked" : "outbox.notTicked");
    }
    const choice = choiceSaid(content, body.stepId, slot, value);
    if (choice) {
      return language === "en" ? (choice.en ?? choice.bn) : choice.bn;
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
  held: { entry, refusal },
  tone,
  onDiscard,
  onRecover,
}: {
  held: Held;
  tone: "danger" | "info";
  onDiscard: (id: string) => void;
  onRecover: (held: Held) => void;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const tag = animalOf(entry);
  const recordedAt = new Date(entry.recordedAt);
  // The work as this phone last had it, which says what the Step's choices are called.
  const { instanceId } = entry.body as { instanceId?: string };
  const work = instanceId
    ? queryClient.getQueryData(
        orpc.work.get.queryKey({ input: { id: instanceId } })
      )
    : undefined;
  const Icon = tone === "danger" ? Undo2 : Eye;
  return (
    <li className="surface flex flex-col gap-3 p-4 md:p-5">
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
            {/* A batch refused whole has only the server's English, kept for whoever reads a log. */}
            {entryRefusalMessage(refusal, t) ??
              t(tone === "info" ? "outbox.reviewedTitle" : "outbox.wrong")}
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
          {entered(entry, t, language, work?.content) ||
            t(KIND_WORD[entry.kind])}
        </p>
      </div>
      {tone === "danger" && phoneOutbox()?.canRecover(entry) ? (
        <Button
          className="h-12 w-full sm:w-auto sm:self-end md:h-9"
          onClick={() => onRecover({ entry, refusal, reason: "" })}
        >
          <Undo2 data-icon="inline-start" />
          {t("outbox.recover")}
        </Button>
      ) : null}
      {tone === "danger" && !phoneOutbox()?.canRecover(entry) ? (
        <p className="text-muted-foreground text-sm">
          {t("outbox.recoveryAuthor")}
        </p>
      ) : null}
      <Button
        className="h-auto min-h-12 w-full whitespace-normal sm:w-auto sm:self-end md:min-h-9"
        onClick={() => onDiscard(entry.id)}
        variant="outline"
      >
        <ListX aria-hidden data-icon="inline-start" />
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
  onRecover,
}: {
  rows: Held[];
  emptyKey: "outbox.heldNone" | "outbox.reviewedNone";
  tone: "danger" | "info";
  onDiscard: (id: string) => void;
  onRecover: (held: Held) => void;
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
          onRecover={onRecover}
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
  const [recovering, setRecovering] = useState<Held | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
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
      const outbox = phoneOutbox();
      if (!outbox) {
        throw new Error("The phone outbox is unavailable");
      }
      await outbox.discard(id);
    },
    onSuccess: () => {
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ["outbox"] });
    },
    onError: () => toast.error(t("outbox.discardFailed")),
  });

  const recover = recovering ? (
    <RecoverEntry
      held={recovering}
      key={recovering.entry.id}
      onClose={() => setRecovering(null)}
    />
  ) : null;
  if (
    recovering?.entry.kind === "step_completion" ||
    recovering?.entry.kind === "step_correction"
  ) {
    return recover;
  }

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
            onDiscard={setRemoving}
            onRecover={setRecovering}
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
            onRecover={setRecovering}
            rows={held.data?.reviewed ?? []}
            tone="info"
          />
        </Section>
      </Loaded>
      {recover}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !discard.isPending) {
            setRemoving(null);
          }
        }}
        title={t("outbox.discardTitle")}
        description={t("outbox.discardHint")}
        confirmLabel={t("outbox.discard")}
        cancelLabel={t("outbox.keepEntry")}
        pending={discard.isPending}
        onConfirm={() => {
          if (removing) {
            discard.mutate(removing);
          }
        }}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/outbox")({
  staticData: { focusedWork: true },
  component: OutboxPage,
});

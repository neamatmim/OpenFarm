import type { ReviewReason } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleCheck, Gavel, Inbox } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Nothing, SaidDate } from "@/components/list-cells";
import { EmptyState, Loaded, TagChip } from "@/components/page";
import { ReasonDialog } from "@/components/sign-off/reason-dialog";
import type { Asked, OpenReview } from "@/components/sign-off/sign-off-types";
import { useLanguage } from "@/i18n/language-provider";
import { entryRefusalMessage } from "@/lib/correction-refusal";
import { useInFlight } from "@/lib/in-flight";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** Every reason has something to say, typed by the reason rather than by string, so a new
 *  one is a compile error here rather than a row that renders as its own name. */
const REASON_MESSAGE: Record<ReviewReason, MessageKey> = {
  corrected_after_sign_off: "review.corrected_after_sign_off",
  irreversible_effect: "review.irreversible_effect",
  late_entry: "review.late_entry",
  sync_gap: "review.sync_gap",
  clock_skew: "review.clock_skew",
  implausible_weight: "review.implausible_weight",
};

const messageFor = (reason: string): MessageKey | null =>
  (REASON_MESSAGE as Record<string, MessageKey>)[reason] ?? null;

/** What each kind of entry a phone sends is called, so a held one says what it was. */
const HELD_KIND: Record<string, MessageKey> = {
  step_completion: "review.held.step_completion",
  completion_photo: "review.held.completion_photo",
  instance_claim: "review.held.instance_claim",
  instance_complete: "review.held.instance_complete",
  animal_move: "review.held.animal_move",
  observation: "review.held.observation",
};

/** What a row can do: open the dialog that closes it with a judgement, or the one that takes held work in. */
interface ReviewActions {
  busy: (id: string) => boolean;
  handleResolve: (row: OpenReview) => void;
  handleTakeIn: (row: OpenReview) => void;
}

interface ReviewRow extends OpenReview {
  actions: ReviewActions;
}

interface ReviewCell {
  row: { original: ReviewRow };
}

/** What a phone sent that the farm held: what kind of thing, about which animal, what was entered, by whom and when. */
const WhatWasHeld = ({ held }: { held: NonNullable<OpenReview["held"]> }) => {
  const { t, language } = useLanguage();
  const kind = HELD_KIND[held.kind];
  // Figures in the reader's own digits; anything else as it was typed.
  const entered =
    held.skipReason ??
    held.evidence
      .map((value) =>
        typeof value === "number"
          ? formatNumber(value, language)
          : String(value)
      )
      .join(", ");
  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span>{kind ? t(kind) : held.kind}</span>
      {held.animalTag ? <TagChip>{held.animalTag}</TagChip> : null}
      {entered ? (
        <span className="text-foreground font-medium">{entered}</span>
      ) : null}
      {held.recordedBy ? (
        <span>{t("review.heldBy", { name: held.recordedBy })}</span>
      ) : null}
      <span className="tabular-nums">
        {formatDate(new Date(held.recordedAt), language, "dateTime")}
      </span>
    </span>
  );
};

/** What happened, in the farm's words for the reason — opening the work it came from, where it came from one — and, for
 *  an entry a phone sent, what it was. */
const WhatHappened = ({ row }: { row: OpenReview }) => {
  const { t } = useLanguage();
  const key = messageFor(row.reason);
  const said = key ? t(key) : row.reason;
  return (
    <span className="flex flex-col gap-0.5">
      {row.instanceId ? (
        <Link
          className="font-medium underline-offset-4 hover:underline"
          params={{ instanceId: row.instanceId }}
          to="/work/$instanceId"
        >
          {said}
        </Link>
      ) : (
        <span className="font-medium">{said}</span>
      )}
      {row.held ? <WhatWasHeld held={row.held} /> : null}
    </span>
  );
};

/** Why it is waiting: the Entry's own word, in the reader's language, for one a phone sent; the reason somebody gave
 *  for anything else. */
const useWhy = (row: OpenReview): string | null => {
  const { t } = useLanguage();
  const worded = row.held?.refusal
    ? entryRefusalMessage(row.held.refusal, t)
    : null;
  return worded ?? row.raisedBy.reason ?? null;
};

const TakeInButton = ({ row, size }: { row: ReviewRow; size?: "sm" }) => {
  const { t } = useLanguage();
  const { busy, handleTakeIn } = row.actions;
  return (
    <Button
      disabled={busy(row.id)}
      onClick={() => handleTakeIn(row)}
      size={size}
      type="button"
    >
      <Inbox aria-hidden data-icon="inline-start" />
      {t("review.takeIn")}
    </Button>
  );
};

const ResolveButton = ({
  row,
  size,
}: {
  row: ReviewRow;
  /** "sm" in a table's row, whose buttons are the small size so their words sit on the row's line. */
  size?: "sm";
}) => {
  const { t } = useLanguage();
  const { busy, handleResolve } = row.actions;
  const waiting = busy(row.id);
  return (
    <Button
      disabled={waiting}
      onClick={() => handleResolve(row)}
      size={size}
      type="button"
      variant="outline"
    >
      {waiting ? <Spinner /> : <Gavel aria-hidden data-icon="inline-start" />}
      {t("review.resolve")}
    </Button>
  );
};

const WhatCell = ({ row }: ReviewCell) => <WhatHappened row={row.original} />;

const RaisedCell = ({ row }: ReviewCell) => (
  <span className="whitespace-nowrap tabular-nums">
    <SaidDate at={row.original.raisedAt} withTime />
  </span>
);

const WhyCell = ({ row }: ReviewCell) => {
  const why = useWhy(row.original);
  return why ? (
    <span className="text-muted-foreground">“{why}”</span>
  ) : (
    <Nothing />
  );
};

const ResolveCell = ({ row }: ReviewCell) => (
  <div className="flex justify-end gap-2">
    {row.original.held?.mayTakeIn ? (
      <TakeInButton row={row.original} size="sm" />
    ) : null}
    <ResolveButton row={row.original} size="sm" />
  </div>
);

const column = createListColumns<ReviewRow>();
const reviewColumns = column.columns([
  column.accessor("reason", {
    header: listHeader("review.col.what"),
    cell: WhatCell,
    meta: { className: "min-w-64" },
  }),
  column.accessor((row) => new Date(row.raisedAt), {
    id: "raised",
    header: listHeader("review.col.raised"),
    cell: RaisedCell,
  }),
  column.display({
    id: "why",
    header: listHeader("review.col.why"),
    cell: WhyCell,
    meta: { className: "min-w-48" },
  }),
  column.display({
    id: "actions",
    header: ActionsHeader,
    cell: ResolveCell,
    meta: { align: "end" },
  }),
]);

/** One thing to look at, on a phone: what happened, when and the reason given, and closing it at the foot. */
const ReviewCard = ({ row }: { row: ReviewRow }) => {
  const { language } = useLanguage();
  const why = useWhy(row);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <WhatHappened row={row} />
        <span className="text-muted-foreground text-sm">
          <span className="tabular-nums">
            {formatDate(new Date(row.raisedAt), language, "dateTime")}
          </span>
          {why ? ` · “${why}”` : ""}
        </span>
      </div>
      <div className="flex justify-end gap-2">
        {row.held?.mayTakeIn ? <TakeInButton row={row} /> : null}
        <ResolveButton row={row} />
      </div>
    </div>
  );
};

const reviewCard = (row: ReviewRow) => <ReviewCard row={row} />;

/** What the system could not put right on its own. Closing one is a judgement, so it asks
 *  for the judgement rather than offering a tick. */
export const NeedsReview = ({
  queue,
  waiting,
}: {
  queue: Asked<OpenReview>;
  /** How many are waiting in all, where more are waiting than the list carries. */
  waiting?: number;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [resolving, setResolving] = useState<OpenReview | null>(null);
  const [takingIn, setTakingIn] = useState<OpenReview | null>(null);
  // For a doubted weight: the Manager looked, and the reading is right — its doubt lifted, the ones after it judged again.
  const [readingStands, setReadingStands] = useState(false);
  const aWeight = resolving?.reason === "implausible_weight";
  const inFlight = useInFlight();
  const resolve = useMutation(
    orpc.reviewQueue.resolve.mutationOptions({
      onMutate: ({ id }) => inFlight.start(id),
      onSettled: (_data, _error, { id }) => inFlight.end(id),
      onSuccess: () => {
        toast.success(t("review.resolved"));
        setResolving(null);
      },
      onError: refused,
    })
  );
  const takeIn = useMutation(
    orpc.reviewQueue.takeIn.mutationOptions({
      onMutate: ({ id }) => inFlight.start(id),
      onSettled: (_data, _error, { id }) => inFlight.end(id),
      onSuccess: () => {
        toast.success(t("review.takenIn"));
        setTakingIn(null);
      },
      onError: refused,
    })
  );
  // More waiting than the list carries: it says which part this is.
  const moreThanShown =
    waiting !== undefined &&
    queue.data !== undefined &&
    waiting > queue.data.length;
  const actions: ReviewActions = {
    busy: inFlight.has,
    handleResolve: setResolving,
    handleTakeIn: setTakingIn,
  };
  const table = useListTable({
    columns: reviewColumns,
    data: (queue.data ?? []).map((row) => ({ ...row, actions })),
    getRowId: (row) => row.id,
  });

  return (
    <div className="surface p-4 md:p-5">
      <Loaded query={queue}>
        {moreThanShown ? (
          <p className="text-muted-foreground mb-3 text-sm">
            {t("review.oldestOf", {
              shown: queue.data?.length ?? 0,
              waiting: waiting ?? 0,
            })}
          </p>
        ) : null}
        {queue.data?.length ? (
          <DataTable
            card={reviewCard}
            minWidth="48rem"
            pageSize={20}
            table={table}
          />
        ) : (
          <EmptyState bare icon={CircleCheck} title={t("review.none")} />
        )}
      </Loaded>
      <ReasonDialog
        description={t("review.resolveHint")}
        handleSubmit={(resolution) => {
          if (resolving) {
            resolve.mutate({
              id: resolving.id,
              resolution,
              ...(aWeight && readingStands ? { readingStands: true } : {}),
            });
          }
        }}
        key={resolving?.id ?? "none"}
        label={t("review.resolution")}
        onOpenChange={(open) => {
          if (!open) {
            setResolving(null);
            setReadingStands(false);
          }
        }}
        open={resolving !== null}
        pending={resolving !== null && inFlight.has(resolving.id)}
        submitLabel={t("review.resolve")}
        title={t("review.resolve")}
      >
        {aWeight ? (
          <label
            className="has-data-checked:border-primary/40 has-data-checked:bg-primary/5 hover:bg-muted/50 flex h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm md:h-9"
            htmlFor="review-reading-stands"
          >
            <Checkbox
              checked={readingStands}
              id="review-reading-stands"
              onCheckedChange={(checked) => setReadingStands(checked === true)}
            />
            {t("review.weightIsRight")}
          </label>
        ) : null}
      </ReasonDialog>
      <ReasonDialog
        description={t("review.takeInHint")}
        handleSubmit={(note) => {
          if (takingIn) {
            takeIn.mutate({ id: takingIn.id, note });
          }
        }}
        key={`take-${takingIn?.id ?? "none"}`}
        label={t("review.takeInLabel")}
        onOpenChange={(open) => {
          if (!open) {
            setTakingIn(null);
          }
        }}
        open={takingIn !== null}
        pending={takingIn !== null && inFlight.has(takingIn.id)}
        submitLabel={t("review.takeIn")}
        title={t("review.takeIn")}
      />
    </div>
  );
};

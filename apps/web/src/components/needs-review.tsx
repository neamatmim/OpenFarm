import type { ReviewReason } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { CircleCheck, Gavel } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Loaded } from "@/components/page";
import { ReasonDialog } from "@/components/sign-off/reason-dialog";
import type { Asked, OpenReview } from "@/components/sign-off/sign-off-types";
import { useLanguage } from "@/i18n/language-provider";
import { useInFlight } from "@/lib/in-flight";
import { sayWhy } from "@/lib/saying";
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

/** What a row can do: open the dialog that closes it with a judgement. */
interface ReviewActions {
  busy: (id: string) => boolean;
  handleResolve: (row: OpenReview) => void;
}

interface ReviewRow extends OpenReview {
  actions: ReviewActions;
}

interface ReviewCell {
  row: { original: ReviewRow };
}

/** What happened, in the farm's words for the reason. */
const WhatHappened = ({ row }: { row: OpenReview }) => {
  const { t } = useLanguage();
  const key = messageFor(row.reason);
  return <span className="font-medium">{key ? t(key) : row.reason}</span>;
};

const ResolveButton = ({ row }: { row: ReviewRow }) => {
  const { t } = useLanguage();
  const { busy, handleResolve } = row.actions;
  const waiting = busy(row.id);
  return (
    <Button
      disabled={waiting}
      onClick={() => handleResolve(row)}
      type="button"
      variant="outline"
    >
      {waiting ? <Spinner /> : <Gavel aria-hidden data-icon="inline-start" />}
      {t("review.resolve")}
    </Button>
  );
};

const WhatCell = ({ row }: ReviewCell) => <WhatHappened row={row.original} />;

const RaisedCell = ({ row }: ReviewCell) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatDate(new Date(row.original.raisedAt), language, "dateTime")}
    </span>
  );
};

const WhyCell = ({ row }: ReviewCell) =>
  row.original.raisedBy.reason ? (
    <span className="text-muted-foreground">
      “{row.original.raisedBy.reason}”
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );

const ResolveCell = ({ row }: ReviewCell) => (
  <div className="-my-1.5 flex justify-end">
    <ResolveButton row={row.original} />
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
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <WhatHappened row={row} />
        <span className="text-muted-foreground text-sm">
          <span className="tabular-nums">
            {formatDate(new Date(row.raisedAt), language, "dateTime")}
          </span>
          {row.raisedBy.reason ? ` · “${row.raisedBy.reason}”` : ""}
        </span>
      </div>
      <div className="flex justify-end">
        <ResolveButton row={row} />
      </div>
    </div>
  );
};

const reviewCard = (row: ReviewRow) => <ReviewCard row={row} />;

/** What the system could not put right on its own. Closing one is a judgement, so it asks
 *  for the judgement rather than offering a tick. */
export const NeedsReview = ({ queue }: { queue: Asked<OpenReview> }) => {
  const { t } = useLanguage();
  const [resolving, setResolving] = useState<OpenReview | null>(null);
  const inFlight = useInFlight();
  const resolve = useMutation(
    orpc.review.resolve.mutationOptions({
      onMutate: ({ id }) => inFlight.start(id),
      onSettled: (_data, _error, { id }) => inFlight.end(id),
      onSuccess: () => {
        toast.success(t("review.resolved"));
        setResolving(null);
      },
      onError: (error: Error) => toast.error(sayWhy(error, t)),
    })
  );
  const actions: ReviewActions = {
    busy: inFlight.has,
    handleResolve: setResolving,
  };
  const table = useListTable({
    columns: reviewColumns,
    data: (queue.data ?? []).map((row) => ({ ...row, actions })),
    getRowId: (row) => row.id,
  });

  return (
    <div className="bg-card rounded-xl border p-4 md:p-5">
      <Loaded query={queue}>
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
            resolve.mutate({ id: resolving.id, resolution });
          }
        }}
        key={resolving?.id ?? "none"}
        label={t("review.resolution")}
        onOpenChange={(open) => {
          if (!open) {
            setResolving(null);
          }
        }}
        open={resolving !== null}
        pending={resolving !== null && inFlight.has(resolving.id)}
        submitLabel={t("review.resolve")}
        title={t("review.resolve")}
      />
    </div>
  );
};

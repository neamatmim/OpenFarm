import { maySignOff } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ClipboardCheck, Undo2 } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { SaidDate } from "@/components/list-cells";
import { EmptyState, Loaded, TableSkeleton } from "@/components/page";
import { BatchBar } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useInFlight } from "@/lib/in-flight";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { placeOfWork } from "@/lib/work-place";
import { orpc } from "@/utils/orpc";

import { CheckLine } from "./check-line";
import { ReasonDialog } from "./reason-dialog";
import type { Asked, ToCheck } from "./sign-off-types";
import { titleOf } from "./sign-off-types";

/** What a row can do: approve it now, or open the dialog that sends it back. */
interface CheckActions {
  busy: (id: string) => boolean;
  /** Whether this person may sign this work off: not their own, unless they are the Owner. */
  mayCheck: (row: ToCheck) => boolean;
  handleApprove: (id: string) => void;
  handleSendBack: (row: ToCheck) => void;
}

interface CheckRow extends ToCheck {
  actions: CheckActions;
}

interface CheckCell {
  row: { original: CheckRow };
}

/** The work's name, opening the work itself: what was recorded is read there before it is signed. */
const WorkName = ({ row }: { row: ToCheck }) => {
  const { language } = useLanguage();
  return (
    <Link
      className="font-medium underline-offset-4 hover:underline"
      params={{ instanceId: row.id }}
      to="/work/$instanceId"
    >
      {titleOf(row, language === "bn")}
    </Link>
  );
};

/** Approve, the act the queue is for, and send back beside it — each waiting only on its own row's answer. */
const CheckButtons = ({
  row,
  size,
}: {
  row: CheckRow;
  /** "sm" in a table's row, whose buttons are the small size so their words sit on the row's line. */
  size?: "sm";
}) => {
  const { t } = useLanguage();
  const { busy, handleApprove, handleSendBack, mayCheck } = row.actions;
  const waiting = busy(row.id);
  // Their own work: somebody else checks it, and saying so is better than two buttons the farm would refuse.
  if (!mayCheck(row)) {
    return (
      <p className="text-muted-foreground text-end text-sm">
        {t("signOff.yoursToBeChecked")}
      </p>
    );
  }
  return (
    <div className="flex shrink-0 items-center justify-end gap-2">
      <Button
        disabled={waiting}
        onClick={() => handleSendBack(row)}
        size={size}
        type="button"
        variant="outline"
      >
        <Undo2 aria-hidden data-icon="inline-start" />
        {t("signOff.sendBack")}
      </Button>
      <Button
        disabled={waiting}
        onClick={() => handleApprove(row.id)}
        size={size}
        type="button"
      >
        {waiting ? <Spinner /> : <Check aria-hidden data-icon="inline-start" />}
        {t("signOff.approve")}
      </Button>
    </div>
  );
};

/** The work's name, and what it came to beneath: read in the row rather than by opening each. */
const WorkCell = ({ row }: CheckCell) => (
  <div className="flex flex-col gap-1">
    <WorkName row={row.original} />
    <CheckLine check={row.original.check} />
  </div>
);

const WhereCell = ({ row }: CheckCell) => {
  const { t } = useLanguage();
  return placeOfWork(row.original.pen, t("work.wholeFarm"));
};

const DueCell = ({ row }: CheckCell) => (
  <span className="whitespace-nowrap tabular-nums">
    <SaidDate at={row.original.dueAt} withTime />
  </span>
);

const ButtonsCell = ({ row }: CheckCell) => (
  <CheckButtons row={row.original} size="sm" />
);

const column = createListColumns<CheckRow>();
const checkColumns = column.columns([
  column.accessor((row) => titleOf(row, true), {
    id: "work",
    header: listHeader("signOff.col.work"),
    cell: WorkCell,
  }),
  column.accessor((row) => placeOfWork(row.pen, ""), {
    id: "where",
    header: listHeader("signOff.col.where"),
    cell: WhereCell,
  }),
  column.accessor((row) => new Date(row.dueAt), {
    id: "due",
    header: listHeader("signOff.col.due"),
    cell: DueCell,
  }),
  column.display({
    id: "actions",
    header: ActionsHeader,
    cell: ButtonsCell,
    meta: { align: "end" },
  }),
]);

/** A piece of work to check on a phone: its name and where, when it was due, and the two acts beneath. */
const CheckCard = ({ row }: { row: CheckRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <WorkName row={row} />
        <span className="text-muted-foreground text-sm">
          {placeOfWork(row.pen, t("work.wholeFarm"))} ·{" "}
          <span className="tabular-nums">
            {formatDate(new Date(row.dueAt), language, "dateTime")}
          </span>
        </span>
      </div>
      <CheckLine check={row.check} />
      <CheckButtons row={row} />
    </div>
  );
};

const checkCard = (row: CheckRow) => <CheckCard row={row} />;

/** The clean ones approved together: how many, and what makes one clean. */
const ApproveTheClean = ({
  count,
  handleApprove,
  pending,
}: {
  count: number;
  handleApprove: () => void;
  pending: boolean;
}) => {
  const { t, language } = useLanguage();
  return (
    <div className="bg-accent text-accent-foreground flex flex-col gap-2 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm">{t("signOff.approveCleanHint")}</span>
      <Button
        className="h-12 md:h-9"
        disabled={pending}
        onClick={handleApprove}
        type="button"
      >
        {pending ? <Spinner /> : <Check aria-hidden data-icon="inline-start" />}
        {t("signOff.approveClean", { count: formatNumber(count, language) })}
      </Button>
    </div>
  );
};

/**
 * Work done and waiting on the checker: approve it where it stands, or send it back with what needs doing again. Each
 * row waits only for its own answer, so the rest of the queue stays usable while one is saving. Rows may be ticked and
 * approved together, on a phone as at a desk, the job done most to many at once; sending back stays one at a time, as
 * each needs its own reason.
 */
export const CheckTab = ({ queue }: { queue: Asked<ToCheck> }) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const inFlight = useInFlight();
  const [sendingBack, setSendingBack] = useState<ToCheck | null>(null);
  const tracked = {
    onMutate: ({ id }: { id: string }) => inFlight.start(id),
    onSettled: (_data: unknown, _error: unknown, { id }: { id: string }) =>
      inFlight.end(id),
    onError: refused,
  };
  // One approval at a time for the rows ticked together: each is its own Sign-off in the audit log, and a refused one
  // says why without stopping the rest. No toast each — one says how many when they are done.
  const approveOne = useMutation(orpc.work.approve.mutationOptions(tracked));
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const [approvingMany, setApprovingMany] = useState(false);
  const approve = useMutation(
    orpc.work.approve.mutationOptions({
      ...tracked,
      onSuccess: () => {
        toast.success(t("signOff.approved"));
      },
    })
  );
  const sendBack = useMutation(
    orpc.work.sendBack.mutationOptions({
      ...tracked,
      onSuccess: () => {
        toast.success(t("signOff.sentBack"));
        setSendingBack(null);
      },
    })
  );
  const me = useQuery(orpc.people.me.queryOptions());
  const actions: CheckActions = {
    busy: inFlight.has,
    mayCheck: (row) =>
      me.data === undefined ||
      maySignOff(row, { id: me.data.id, roles: me.data.roles }),
    handleApprove: (id) => approve.mutate({ id }),
    handleSendBack: setSendingBack,
  };
  // A row that has left the queue — approved, sent back, or by somebody else — is no longer ticked.
  const inQueue = new Set((queue.data ?? []).map((row) => row.id));
  const chosen = [...ticked].filter((id) => inQueue.has(id));
  // The clean ones — on time, nothing flagged, nothing skipped but animals passed as well — approved together, on a
  // phone as on a desk: the rest are read before they are signed.
  const clean = (queue.data ?? [])
    .filter(
      (row) =>
        row.check?.clean && actions.mayCheck(row) && !inFlight.has(row.id)
    )
    .map((row) => row.id);
  // Two or more of them, and nothing ticked by hand: one clean piece is approved where it stands.
  const offerTheClean = clean.length > 1 && chosen.length === 0;
  const approveAll = async (ids: readonly string[]) => {
    setApprovingMany(true);
    let done = 0;
    for (const id of ids) {
      try {
        // In turn, not all at once: the farm's answer to one comes before the next is asked.
        // oxlint-disable-next-line no-await-in-loop
        await approveOne.mutateAsync({ id });
        done += 1;
      } catch {
        // Said by the mutation's own refusal; the rest go on.
      }
    }
    setApprovingMany(false);
    setTicked(new Set());
    if (done > 0) {
      toast.success(t("signOff.approvedMany", { count: done }));
    }
  };
  const table = useListTable({
    columns: checkColumns,
    data: (queue.data ?? []).map((row) => ({ ...row, actions })),
    getRowId: (row) => row.id,
  });
  return (
    <div className="surface p-4 md:p-5">
      <Loaded query={queue} skeleton={<TableSkeleton />}>
        {queue.data?.length ? (
          <div className="flex flex-col gap-3">
            {offerTheClean ? (
              <ApproveTheClean
                count={clean.length}
                handleApprove={() => approveAll(clean)}
                pending={approvingMany}
              />
            ) : null}
            {/* Carbon's batch bar: over the table while rows are ticked, what is ticked and what to do with it. */}
            {chosen.length > 0 ? (
              <BatchBar
                busy={approvingMany}
                onClear={() => setTicked(new Set())}
                said={t("signOff.selected", { count: chosen.length })}
              >
                <Button
                  disabled={approvingMany}
                  onClick={() => approveAll(chosen)}
                  type="button"
                >
                  {approvingMany ? (
                    <Spinner />
                  ) : (
                    <Check aria-hidden data-icon="inline-start" />
                  )}
                  {t("signOff.approveSelected", { count: chosen.length })}
                </Button>
              </BatchBar>
            ) : null}
            <DataTable
              card={checkCard}
              minWidth="48rem"
              pageSize={20}
              selection={{
                selected: new Set(chosen),
                onChange: setTicked,
                selectable: (row) =>
                  actions.mayCheck(row) && !inFlight.has(row.id),
                label: (row) =>
                  t("signOff.select", {
                    work: titleOf(row, language === "bn"),
                  }),
              }}
              table={table}
            />
          </div>
        ) : (
          <EmptyState bare icon={ClipboardCheck} title={t("signOff.none")} />
        )}
      </Loaded>
      <ReasonDialog
        description={t("signOff.sendBackHint")}
        handleSubmit={(reason) => {
          if (sendingBack) {
            sendBack.mutate({ id: sendingBack.id, reason });
          }
        }}
        key={sendingBack?.id ?? "none"}
        label={t("signOff.reason")}
        onOpenChange={(open) => {
          if (!open) {
            setSendingBack(null);
          }
        }}
        open={sendingBack !== null}
        pending={sendingBack !== null && inFlight.has(sendingBack.id)}
        submitLabel={t("signOff.sendBack")}
        title={
          sendingBack
            ? `${t("signOff.sendBack")} — ${titleOf(sendingBack, language === "bn")}`
            : t("signOff.sendBack")
        }
      />
    </div>
  );
};

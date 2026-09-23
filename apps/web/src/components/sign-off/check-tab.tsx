import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ClipboardCheck, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { SaidDate } from "@/components/list-cells";
import { EmptyState, Loaded } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useInFlight } from "@/lib/in-flight";
import { useRefused } from "@/lib/refused";
import { placeOfWork } from "@/lib/work-place";
import { orpc } from "@/utils/orpc";

import { ReasonDialog } from "./reason-dialog";
import type { Asked, ToCheck } from "./sign-off-types";
import { titleOf } from "./sign-off-types";

/** What a row can do: approve it now, or open the dialog that sends it back. */
interface CheckActions {
  busy: (id: string) => boolean;
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
const CheckButtons = ({ row }: { row: CheckRow }) => {
  const { t } = useLanguage();
  const { busy, handleApprove, handleSendBack } = row.actions;
  const waiting = busy(row.id);
  return (
    <div className="flex shrink-0 items-center justify-end gap-2">
      <Button
        disabled={waiting}
        onClick={() => handleSendBack(row)}
        type="button"
        variant="outline"
      >
        <Undo2 aria-hidden data-icon="inline-start" />
        {t("signOff.sendBack")}
      </Button>
      <Button
        disabled={waiting}
        onClick={() => handleApprove(row.id)}
        type="button"
      >
        {waiting ? <Spinner /> : <Check aria-hidden data-icon="inline-start" />}
        {t("signOff.approve")}
      </Button>
    </div>
  );
};

const WorkCell = ({ row }: CheckCell) => <WorkName row={row.original} />;

const WhereCell = ({ row }: CheckCell) => {
  const { t } = useLanguage();
  return placeOfWork(row.original.pen, t("work.wholeFarm"));
};

const DueCell = ({ row }: CheckCell) => (
  <span className="whitespace-nowrap tabular-nums">
    <SaidDate at={row.original.dueAt} withTime />
  </span>
);

/** In the table the buttons sit level with the row's line of text, not below it. */
const ButtonsCell = ({ row }: CheckCell) => (
  <div className="-my-1.5">
    <CheckButtons row={row.original} />
  </div>
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
      <CheckButtons row={row} />
    </div>
  );
};

const checkCard = (row: CheckRow) => <CheckCard row={row} />;

/**
 * Work done and waiting on the checker: approve it where it stands, or send it back with what needs doing again. Each
 * row waits only for its own answer, so the rest of the queue stays usable while one is saving.
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
  const approve = useMutation(
    orpc.instances.approve.mutationOptions({
      ...tracked,
      onSuccess: () => {
        toast.success(t("signOff.approved"));
      },
    })
  );
  const sendBack = useMutation(
    orpc.instances.sendBack.mutationOptions({
      ...tracked,
      onSuccess: () => {
        toast.success(t("signOff.sentBack"));
        setSendingBack(null);
      },
    })
  );
  const actions: CheckActions = {
    busy: inFlight.has,
    handleApprove: (id) => approve.mutate({ id }),
    handleSendBack: setSendingBack,
  };
  const table = useListTable({
    columns: checkColumns,
    data: (queue.data ?? []).map((row) => ({ ...row, actions })),
    getRowId: (row) => row.id,
  });
  return (
    <div className="bg-card rounded-xl border p-4 md:p-5">
      <Loaded query={queue}>
        {queue.data?.length ? (
          <DataTable
            card={checkCard}
            minWidth="48rem"
            pageSize={20}
            table={table}
          />
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

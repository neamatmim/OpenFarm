import { hoursLate } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleCheck, CircleSlash, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Loaded, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useInFlight } from "@/lib/in-flight";
import { useRefused } from "@/lib/refused";
import { placeOfWork } from "@/lib/work-place";
import { orpc } from "@/utils/orpc";

import { ReasonDialog } from "./reason-dialog";
import type { Asked, LateWork } from "./sign-off-types";
import { titleOf } from "./sign-off-types";

/** What a late row can do: open the dialog that closes it as missed. */
interface LateActions {
  busy: (id: string) => boolean;
  handleMissed: (row: LateWork) => void;
}

interface LateRow extends LateWork {
  actions: LateActions;
}

interface LateCell {
  row: { original: LateRow };
}

/** The late work's name, opening the work: it may still be done. */
const LateName = ({ row }: { row: LateWork }) => {
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

/** How late, as a word with its colour. */
const Lateness = ({ row }: { row: LateWork }) => {
  const { t } = useLanguage();
  return (
    <StatusBadge icon={Clock} tone="warning">
      {t("work.lateFor", { hours: hoursLate(row.minutesOverdue) })}
    </StatusBadge>
  );
};

const MissedButton = ({ row }: { row: LateRow }) => {
  const { t } = useLanguage();
  const { busy, handleMissed } = row.actions;
  const waiting = busy(row.id);
  return (
    <Button
      disabled={waiting}
      onClick={() => handleMissed(row)}
      type="button"
      variant="outline"
    >
      {waiting ? (
        <Spinner />
      ) : (
        <CircleSlash aria-hidden data-icon="inline-start" />
      )}
      {t("signOff.missed")}
    </Button>
  );
};

const NameCell = ({ row }: LateCell) => <LateName row={row.original} />;

const WhereCell = ({ row }: LateCell) => {
  const { t } = useLanguage();
  return placeOfWork(row.original.pen, t("work.wholeFarm"));
};

const LateCellView = ({ row }: LateCell) => <Lateness row={row.original} />;

const MissedCell = ({ row }: LateCell) => (
  <div className="-my-1.5 flex justify-end">
    <MissedButton row={row.original} />
  </div>
);

const column = createListColumns<LateRow>();
const lateColumns = column.columns([
  column.accessor((row) => titleOf(row, true), {
    id: "work",
    header: listHeader("signOff.col.work"),
    cell: NameCell,
  }),
  column.accessor((row) => placeOfWork(row.pen, ""), {
    id: "where",
    header: listHeader("signOff.col.where"),
    cell: WhereCell,
  }),
  column.accessor("minutesOverdue", {
    header: listHeader("signOff.col.late"),
    cell: LateCellView,
  }),
  column.display({
    id: "actions",
    header: ActionsHeader,
    cell: MissedCell,
    meta: { align: "end" },
  }),
]);

/** Late work on a phone: its name and how late on one line, where beneath, and closing it at the right. */
const LateCard = ({ row }: { row: LateRow }) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <LateName row={row} />
          <Lateness row={row} />
        </div>
        <span className="text-muted-foreground text-sm">
          {placeOfWork(row.pen, t("work.wholeFarm"))}
        </span>
      </div>
      <div className="flex justify-end">
        <MissedButton row={row} />
      </div>
    </div>
  );
};

const lateCard = (row: LateRow) => <LateCard row={row} />;

/**
 * Work gone late and still open, longest late first. It may still be done — its name opens it — or the Manager closes
 * it as missed, saying why.
 */
export const LateTab = ({ late }: { late: Asked<LateWork> }) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const inFlight = useInFlight();
  const [closing, setClosing] = useState<LateWork | null>(null);
  const closeAsMissed = useMutation(
    orpc.instances.closeAsMissed.mutationOptions({
      onMutate: ({ id }) => inFlight.start(id),
      onSettled: (_data, _error, { id }) => inFlight.end(id),
      onError: refused,
      onSuccess: () => {
        toast.success(t("signOff.closedMissed"));
        setClosing(null);
      },
    })
  );
  const actions: LateActions = {
    busy: inFlight.has,
    handleMissed: setClosing,
  };
  const table = useListTable({
    columns: lateColumns,
    data: (late.data ?? []).map((row) => ({ ...row, actions })),
    getRowId: (row) => row.id,
  });
  return (
    <div className="surface p-4 md:p-5">
      <Loaded query={late}>
        {late.data?.length ? (
          <DataTable
            card={lateCard}
            minWidth="44rem"
            pageSize={20}
            table={table}
          />
        ) : (
          <EmptyState bare icon={CircleCheck} title={t("work.overdueNone")} />
        )}
      </Loaded>
      <ReasonDialog
        description={t("signOff.missedHint")}
        handleSubmit={(reason) => {
          if (closing) {
            closeAsMissed.mutate({ id: closing.id, reason });
          }
        }}
        key={closing?.id ?? "none"}
        label={t("signOff.missedWhy")}
        onOpenChange={(open) => {
          if (!open) {
            setClosing(null);
          }
        }}
        open={closing !== null}
        pending={closing !== null && inFlight.has(closing.id)}
        submitLabel={t("signOff.missed")}
        title={
          closing
            ? `${t("signOff.missed")} — ${titleOf(closing, language === "bn")}`
            : t("signOff.missed")
        }
      />
    </div>
  );
};

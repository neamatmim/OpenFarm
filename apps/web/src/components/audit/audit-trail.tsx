import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { ChevronRight, Eye } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { StatusBadge } from "@/components/page";
import { useLanguage, useT } from "@/i18n/language-provider";

import type { AuditEvent } from "./audit-words";
import {
  ACTION_TONE,
  becauseOf,
  entityLabelKey,
  fieldChanges,
} from "./audit-words";

/** How many events a page of the trail shows before the next. */
const TRAIL_PAGE = 20;

const pretty = (value: unknown): string =>
  value === null || value === undefined ? "—" : JSON.stringify(value, null, 2);

/** The record an Audit Event is about, in the reader's words where the screen has them. */
const RecordName = ({ entity }: { entity: string }) => {
  const t = useT();
  const entityKey = entityLabelKey(entity);
  return entityKey ? t(entityKey) : entity;
};

/** What was done, as a word with its colour. */
const ActionBadge = ({ event }: { event: AuditEvent }) => {
  const t = useT();
  return (
    <StatusBadge tone={ACTION_TONE[event.action]}>
      {t(`audit.action.${event.action}`)}
    </StatusBadge>
  );
};

/** Why it happened: the reason somebody gave, and what closed or reopened the work. */
const Why = ({ event }: { event: AuditEvent }) => {
  const t = useT();
  const because = becauseOf(event.after);
  if (!(event.reason || because)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {event.reason ? <p>{event.reason}</p> : null}
      {because ? <p className="text-muted-foreground">{t(because)}</p> : null}
    </div>
  );
};

/** Who did it, in which Role: the System, where no person did. */
const Who = ({ event }: { event: AuditEvent }) => {
  const t = useT();
  return (
    <div className="flex flex-col gap-0.5">
      <span>{event.actor?.name ?? t("audit.system")}</span>
      {event.roleUsed ? (
        <span className="text-muted-foreground text-xs">
          {t(`role.${event.roleUsed}`)}
        </span>
      ) : null}
    </div>
  );
};

interface TrailRow extends AuditEvent {
  handleOpen: (id: string) => void;
}

const WhenCell = ({ row }: { row: { original: TrailRow } }) => {
  const { language } = useLanguage();
  return (
    <span className="text-muted-foreground whitespace-nowrap tabular-nums">
      {formatDate(new Date(row.original.receivedAt), language, "dateTime")}
    </span>
  );
};

const WhoCell = ({ row }: { row: { original: TrailRow } }) => (
  <Who event={row.original} />
);

const ActionCell = ({ row }: { row: { original: TrailRow } }) => (
  <ActionBadge event={row.original} />
);

const RecordCell = ({ row }: { row: { original: TrailRow } }) => (
  <span className="font-medium">
    <RecordName entity={row.original.entity} />
  </span>
);

const WhyCell = ({ row }: { row: { original: TrailRow } }) => (
  <Why event={row.original} />
);

/** The way into one event's before and after. */
const OpenButton = ({ row }: { row: TrailRow }) => {
  const t = useT();
  return (
    <Button
      onClick={() => row.handleOpen(row.id)}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Eye aria-hidden data-icon="inline-start" />
      {t("audit.details")}
    </Button>
  );
};

const OpenCell = ({ row }: { row: { original: TrailRow } }) => (
  <OpenButton row={row.original} />
);

const column = createListColumns<TrailRow>();
const trailColumns = column.columns([
  column.accessor((event) => new Date(event.receivedAt).getTime(), {
    id: "when",
    header: listHeader("audit.when"),
    cell: WhenCell,
  }),
  column.accessor((event) => event.actor?.name ?? "", {
    id: "who",
    header: listHeader("audit.who"),
    cell: WhoCell,
  }),
  column.accessor("action", {
    header: listHeader("audit.action"),
    cell: ActionCell,
  }),
  column.accessor("entity", {
    header: listHeader("audit.entity"),
    cell: RecordCell,
  }),
  column.accessor((event) => event.reason ?? "", {
    id: "reason",
    header: listHeader("audit.reason"),
    cell: WhyCell,
    meta: { className: "min-w-48" },
  }),
  column.display({
    id: "open",
    header: ActionsHeader,
    cell: OpenCell,
    meta: { align: "end" },
  }),
]);

/** One event on a phone: what was done to which record, who did it and when, why — and the way into it. */
const TrailCard = ({ row }: { row: TrailRow }) => {
  const { t, language } = useLanguage();
  return (
    <button
      className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-1 text-left outline-none focus-visible:ring-2"
      onClick={() => row.handleOpen(row.id)}
      type="button"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <ActionBadge event={row} />
          <span className="font-medium">
            <RecordName entity={row.entity} />
          </span>
        </div>
        <span className="text-muted-foreground text-xs">
          {row.actor?.name ?? t("audit.system")}
          {row.roleUsed ? ` · ${t(`role.${row.roleUsed}`)}` : ""} ·{" "}
          {formatDate(new Date(row.receivedAt), language, "dateTime")}
        </span>
        {row.reason ? <span className="line-clamp-2">{row.reason}</span> : null}
      </div>
      <ChevronRight
        aria-hidden
        className="text-muted-foreground mt-1 size-4 shrink-0"
      />
    </button>
  );
};

const trailCard = (row: TrailRow) => <TrailCard row={row} />;

/** A line of the event's particulars: what it is, and what it says. */
const Particular = ({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd>{children}</dd>
  </div>
);

/** The fields the change touched, each as it stood before and after. */
const ChangedFields = ({ event }: { event: AuditEvent }) => {
  const t = useT();
  const changes = fieldChanges(event.before, event.after);
  if (changes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("audit.noFields")}</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-medium" scope="col">
              {t("audit.field")}
            </th>
            <th className="px-3 py-2 text-left font-medium" scope="col">
              {t("audit.before")}
            </th>
            <th className="px-3 py-2 text-left font-medium" scope="col">
              {t("audit.after")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {changes.map((change) => (
            <tr className="align-top" key={change.field}>
              <th
                className="px-3 py-2 text-left font-mono text-xs font-medium"
                scope="row"
              >
                {change.field}
              </th>
              <td className="text-danger px-3 py-2 break-all">
                {change.before}
              </td>
              <td className="text-success px-3 py-2 break-all">
                {change.after}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** One event, whole: when, who in which Role, what was done to which record and why, the fields it changed, and what
 *  the record said before and after, folded away until somebody asks. */
const EventSheet = ({
  event,
  onOpenChange,
}: {
  event: AuditEvent | undefined;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <Sheet onOpenChange={onOpenChange} open={event !== undefined}>
      <SheetContent
        className="w-full gap-0 sm:max-w-xl"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b">
          <SheetTitle>
            {event ? (
              <>
                {t(`audit.action.${event.action}`)} ·{" "}
                <RecordName entity={event.entity} />
              </>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {event
              ? formatDate(new Date(event.receivedAt), language, "dateTime")
              : null}
          </SheetDescription>
        </SheetHeader>
        {event ? (
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Particular label={t("audit.who")}>
                <Who event={event} />
              </Particular>
              <Particular label={t("audit.action")}>
                <ActionBadge event={event} />
              </Particular>
              <Particular label={t("audit.entity")}>
                <RecordName entity={event.entity} />
              </Particular>
              <Particular label={t("audit.reason")}>
                <Why event={event} />
              </Particular>
            </dl>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">{t("audit.changedFields")}</h3>
              <ChangedFields event={event} />
            </section>
            <details className="group rounded-lg border">
              <summary className="cursor-pointer px-3 py-2.5 font-medium">
                {t("audit.wholeRecord")}
              </summary>
              <div className="grid gap-2 border-t p-3">
                <pre className="bg-muted/40 overflow-x-auto rounded border p-2 text-xs">
                  {`${t("audit.before")}\n${pretty(event.before)}`}
                </pre>
                <pre className="bg-muted/40 overflow-x-auto rounded border p-2 text-xs">
                  {`${t("audit.after")}\n${pretty(event.after)}`}
                </pre>
              </div>
            </details>
          </div>
        ) : null}
        <SheetFooter className="flex-row justify-end border-t">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("common.close")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

/**
 * The trail as a table where there is room and as cards on a phone, a page at a time: when, who, what was done to
 * which record and why, sortable by any of them. Each event opens whole beside the list.
 */
export const AuditTrail = ({ events }: { events: AuditEvent[] }) => {
  const [open, setOpen] = useState<string | null>(null);
  const table = useListTable({
    columns: trailColumns,
    data: events.map((event) => ({ ...event, handleOpen: setOpen })),
    getRowId: (event) => event.id,
  });
  return (
    <div className="bg-card rounded-xl border p-4 md:p-5">
      <DataTable
        card={trailCard}
        minWidth="52rem"
        pageSize={TRAIL_PAGE}
        table={table}
      />
      <EventSheet
        event={events.find((event) => event.id === open)}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(null);
          }
        }}
      />
    </div>
  );
};

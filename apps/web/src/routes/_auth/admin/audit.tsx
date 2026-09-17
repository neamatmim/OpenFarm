import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Page, PageHeader } from "@/components/page";
import { useLanguage, useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const ENTITIES = [
  "user",
  "invite",
  "farm",
  "sop_instance",
  "animal",
  "step_completion",
  "report",
  "money_event",
  "sale",
  "mortality",
  "sync_entry",
  "sync_batch",
  "sop_proposal",
  "shed_phone",
  "feed_item",
  "diagnosis",
  "alert",
  "sop",
  "sop_version",
  "push_subscription",
  "pen",
  "shed",
  "money_category",
  "drug_product",
  "dispatch",
  "sop_training",
  "registration_certificate",
  "notifiable_disease",
  "feed_in",
  "dls_report",
  "abortion",
  "withdrawal",
  "weigh_in",
  "vet_fee",
  "ration",
  "prescription",
  "medicine_purchase",
  "repeat_breeder_answer",
  "ready_set_aside",
] as const;
type KnownEntity = (typeof ENTITIES)[number];
const PAGE_SIZE = 100;

const isKnownEntity = (entity: string): entity is KnownEntity =>
  (ENTITIES as readonly string[]).includes(entity);
const entityLabelKey = (entity: string): MessageKey | null =>
  isKnownEntity(entity) ? `audit.entity.${entity}` : null;

/** What closed or reopened a piece of work, as the trail names it — a word for the screen to say in the reader's
 *  language — or nothing for a change a person made. */
const becauseOf = (after: unknown): string | null => {
  const said = after as {
    calledOffBy?: unknown;
    raisedAgainBy?: unknown;
  } | null;
  if (typeof said?.calledOffBy === "string") {
    return `audit.calledOffBy.${said.calledOffBy}`;
  }
  if (typeof said?.raisedAgainBy === "string") {
    return `audit.raisedAgainBy.${said.raisedAgainBy}`;
  }
  return null;
};

const pretty = (value: unknown): string =>
  value === null || value === undefined ? "—" : JSON.stringify(value, null, 2);

type AuditEvent = Awaited<ReturnType<typeof orpc.audit.list.call>>[number];

/** The record an Audit Event is about, in the reader's words where the screen has them. */
const RecordName = ({ entity }: { entity: string }) => {
  const t = useT();
  const entityKey = entityLabelKey(entity);
  return entityKey ? t(entityKey) : entity;
};

/** Why it happened: the reason somebody gave — named as the reason where no column heading already names it —
 *  and what closed or reopened the work. */
const Why = ({ event, named }: { event: AuditEvent; named: boolean }) => {
  const t = useT();
  const because = becauseOf(event.after);
  return (
    <>
      {event.reason && named ? (
        <p>
          {t("audit.reason")}: {event.reason}
        </p>
      ) : null}
      {event.reason && !named ? <p>{event.reason}</p> : null}
      {because ? <p>{t(because as MessageKey)}</p> : null}
    </>
  );
};

/** What the record said before and after, folded away until somebody asks. */
const BeforeAndAfter = ({
  event,
  summary,
  className,
  unfolded,
}: {
  event: AuditEvent;
  summary: string;
  className?: string;
  unfolded: string;
}) => {
  const t = useT();
  return (
    <details className={className}>
      <summary className="cursor-pointer">{summary}</summary>
      <div className={unfolded}>
        <pre className="bg-card overflow-x-auto rounded border p-2 text-xs">
          {`${t("audit.before")}\n${pretty(event.before)}`}
        </pre>
        <pre className="bg-card overflow-x-auto rounded border p-2 text-xs">
          {`${t("audit.after")}\n${pretty(event.after)}`}
        </pre>
      </div>
    </details>
  );
};

/** One Audit Event on a phone: what was done to which record, when, by whom, and why. */
const AuditCard = ({ event }: { event: AuditEvent }) => {
  const { t, language } = useLanguage();
  return (
    <li className="surface p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {t(`audit.action.${event.action}`)} ·{" "}
          <RecordName entity={event.entity} />
        </span>
        <span className="text-muted-foreground">
          {formatDate(new Date(event.receivedAt), language, "dateTime")}
        </span>
      </div>
      <p className="text-muted-foreground">
        {event.actor?.name ?? t("audit.system")}
        {event.roleUsed ? ` · ${t(`role.${event.roleUsed}`)}` : ""}
      </p>
      <Why event={event} named />
      <BeforeAndAfter
        className="mt-1"
        event={event}
        unfolded="mt-1 grid gap-2 sm:grid-cols-2"
        summary={t("audit.what")}
      />
    </li>
  );
};

const WhenCell = ({ row }: { row: { original: AuditEvent } }) => {
  const { language } = useLanguage();
  return (
    <span className="text-muted-foreground whitespace-nowrap tabular-nums">
      {formatDate(new Date(row.original.receivedAt), language, "dateTime")}
    </span>
  );
};

/** Who did it, and in which Role: the System, where no person did. */
const WhoCell = ({ row }: { row: { original: AuditEvent } }) => {
  const t = useT();
  const { actor, roleUsed } = row.original;
  return (
    <>
      <div>{actor?.name ?? t("audit.system")}</div>
      {roleUsed ? (
        <div className="text-muted-foreground text-xs">
          {t(`role.${roleUsed}`)}
        </div>
      ) : null}
    </>
  );
};

const ActionCell = ({ row }: { row: { original: AuditEvent } }) => (
  <span className="font-medium">
    {useT()(`audit.action.${row.original.action}`)}
  </span>
);

const RecordCell = ({ row }: { row: { original: AuditEvent } }) => (
  <RecordName entity={row.original.entity} />
);

const WhyCell = ({ row }: { row: { original: AuditEvent } }) => (
  <Why event={row.original} named={false} />
);

const ChangeCell = ({ row }: { row: { original: AuditEvent } }) => {
  const t = useT();
  return (
    <BeforeAndAfter
      event={row.original}
      unfolded="mt-1 flex max-w-72 flex-col gap-2"
      summary={`${t("audit.before")} / ${t("audit.after")}`}
    />
  );
};

const column = createListColumns<AuditEvent>();
const auditColumns = column.columns([
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
    id: "change",
    header: listHeader("audit.what"),
    cell: ChangeCell,
  }),
]);

/** The trail as a table where there is room: when, who, what was done to which record, sortable by any of them. */
const AuditTable = ({ events }: { events: AuditEvent[] }) => {
  const table = useListTable({
    columns: auditColumns,
    data: events,
    getRowId: (event) => event.id,
  });
  return (
    <div className="bg-card hidden rounded-xl border text-sm md:block">
      <DataTable bare minWidth="48rem" table={table} />
    </div>
  );
};

const AuditPage = () => {
  const { t } = useLanguage();
  const me = useQuery(orpc.people.me.queryOptions());
  const seesAll =
    me.data?.roles.some((r) => r === "owner" || r === "manager") ?? false;

  const [entity, setEntity] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{
    entity?: string;
    fromDay?: string;
    toDay?: string;
  }>({});

  const log = useQuery(
    orpc.audit.list.queryOptions({ input: { ...applied, limit: PAGE_SIZE } })
  );

  return (
    <Page width="default" className="max-w-5xl">
      <PageHeader title={t("audit.title")} />
      {seesAll ? null : (
        <p className="text-muted-foreground text-sm">{t("audit.ownOnly")}</p>
      )}

      <form
        className="surface flex flex-wrap items-end gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          // Days are passed through untouched; the API owns the farm-local day boundaries.
          setApplied({
            entity: entity || undefined,
            fromDay: from || undefined,
            toDay: to || undefined,
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="audit-entity">{t("audit.filterEntity")}</Label>
          <select
            id="audit-entity"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="bg-card border-input h-11 rounded-md border px-3 text-base md:h-9 md:text-sm"
          >
            <option value="">{t("audit.all")}</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {t(`audit.entity.${e}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-from">{t("audit.filterFrom")}</Label>
          <Input
            id="audit-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-to">{t("audit.filterTo")}</Label>
          <Input
            id="audit-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          {t("audit.apply")}
        </Button>
      </form>

      {log.data?.length ? (
        <>
          <ul className="space-y-2 md:hidden">
            {log.data.map((event) => (
              <AuditCard event={event} key={event.id} />
            ))}
          </ul>
          <AuditTable events={log.data} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("audit.empty")}</p>
      )}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/audit")({
  component: AuditPage,
});

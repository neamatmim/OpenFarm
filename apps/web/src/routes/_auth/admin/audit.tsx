import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { History, X } from "lucide-react";
import { useState } from "react";

import { AuditTrail } from "@/components/audit/audit-trail";
import { ENTITIES } from "@/components/audit/audit-words";
import {
  EmptyState,
  Loaded,
  Notice,
  Page,
  PageHeader,
} from "@/components/page";
import { FilterBar, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 100;

/** What the trail is narrowed to: a kind of record, a person, and the days between. Empty is everything. */
interface Narrowed {
  entity: string;
  actorId: string;
  from: string;
  to: string;
}

const EVERYTHING: Narrowed = { entity: "", actorId: "", from: "", to: "" };

/** A day typed into the bar, with its word beside it where there is room and in its label always. */
const DayFilter = ({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (day: string) => void;
}) => (
  <label className="flex items-center gap-2 text-sm" htmlFor={id}>
    <span className="text-muted-foreground w-16 shrink-0 sm:w-auto">
      {label}
    </span>
    <Input
      aria-label={label}
      className="sm:w-44"
      id={id}
      onChange={(event) => onChange(event.target.value)}
      type="date"
      value={value}
    />
  </label>
);

/**
 * The audit log: every change the farm has made, who made it in which Role, and why — narrowed by the kind of record,
 * by the person, or by the days between. The Owner and the Manager read everybody's; anybody else reads their own.
 */
const AuditPage = () => {
  const { t } = useLanguage();
  const me = useQuery(orpc.people.me.queryOptions());
  const seesAll =
    me.data?.roles.some((r) => r === "owner" || r === "manager") ?? false;
  // An Investor's trail is the Owner's alone, as the investors page is: the server answers anybody else with
  // nothing, so nobody else is offered it to choose.
  const seesInvestors = me.data?.roles.includes("owner") ?? false;
  const offered = ENTITIES.filter(
    (entity) => seesInvestors || entity !== "investor"
  );
  // The people to narrow to, for whoever may read everybody's actions.
  const people = useQuery({
    ...orpc.people.list.queryOptions(),
    enabled: seesAll,
  });

  const [narrowed, setNarrowed] = useState<Narrowed>(EVERYTHING);
  const narrow = (patch: Partial<Narrowed>) =>
    setNarrowed({ ...narrowed, ...patch });
  const isNarrowed = Object.values(narrowed).some((value) => value !== "");

  // Days are passed through untouched; the API owns the farm-local day boundaries.
  const log = useQuery(
    orpc.audit.list.queryOptions({
      input: {
        entity: narrowed.entity || undefined,
        actorId: (seesAll && narrowed.actorId) || undefined,
        fromDay: narrowed.from || undefined,
        toDay: narrowed.to || undefined,
        limit: PAGE_SIZE,
      },
    })
  );

  return (
    <Page>
      <PageHeader description={t("audit.subtitle")} title={t("audit.title")} />
      {seesAll ? null : <Notice title={t("audit.ownOnly")} tone="info" />}

      <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
        <FilterBar>
          <NativeSelect
            aria-label={t("audit.filterEntity")}
            className="sm:w-56"
            onChange={(event) => narrow({ entity: event.target.value })}
            value={narrowed.entity}
          >
            <option value="">{t("audit.allRecords")}</option>
            {offered.map((entity) => (
              <option key={entity} value={entity}>
                {t(`audit.entity.${entity}`)}
              </option>
            ))}
          </NativeSelect>
          {seesAll ? (
            <NativeSelect
              aria-label={t("audit.filterWho")}
              className="sm:w-52"
              onChange={(event) => narrow({ actorId: event.target.value })}
              value={narrowed.actorId}
            >
              <option value="">{t("audit.everybody")}</option>
              {(people.data?.people ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          <DayFilter
            id="audit-from"
            label={t("audit.filterFrom")}
            onChange={(from) => narrow({ from })}
            value={narrowed.from}
          />
          <DayFilter
            id="audit-to"
            label={t("audit.filterTo")}
            onChange={(to) => narrow({ to })}
            value={narrowed.to}
          />
          {isNarrowed ? (
            <Button
              className="sm:ml-auto"
              onClick={() => setNarrowed(EVERYTHING)}
              type="button"
              variant="ghost"
            >
              <X aria-hidden data-icon="inline-start" />
              {t("audit.clearFilters")}
            </Button>
          ) : null}
        </FilterBar>
        <p className="text-muted-foreground text-xs">
          {t("audit.latest", { count: PAGE_SIZE })}
        </p>
      </div>

      <Loaded query={log} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {log.data?.length ? (
          <AuditTrail events={log.data} />
        ) : (
          <EmptyState icon={History} title={t("audit.empty")} />
        )}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/audit")({
  component: AuditPage,
});

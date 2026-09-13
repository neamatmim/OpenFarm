import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const ENTITIES = ["user", "invite", "farm"] as const;
type KnownEntity = (typeof ENTITIES)[number];
const PAGE_SIZE = 100;

const isKnownEntity = (entity: string): entity is KnownEntity =>
  (ENTITIES as readonly string[]).includes(entity);
const entityLabelKey = (entity: string): MessageKey | null =>
  isKnownEntity(entity) ? `audit.entity.${entity}` : null;

const pretty = (value: unknown): string =>
  value === null || value === undefined ? "—" : JSON.stringify(value, null, 2);

const AuditPage = () => {
  const { t, language } = useLanguage();
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
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("audit.title")}</h1>
      {seesAll ? null : (
        <p className="text-muted-foreground text-sm">{t("audit.ownOnly")}</p>
      )}

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
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
            className="bg-background h-9 rounded-md border px-2 text-sm"
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
        <ul className="space-y-2">
          {log.data.map((event) => {
            const entityKey = entityLabelKey(event.entity);
            return (
              <li key={event.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {t(`audit.action.${event.action}`)} ·{" "}
                    {entityKey ? t(entityKey) : event.entity}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(
                      new Date(event.receivedAt),
                      language,
                      "dateTime"
                    )}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {event.actor?.name ?? t("audit.system")}
                  {event.roleUsed ? ` · ${t(`role.${event.roleUsed}`)}` : ""}
                </p>
                {event.reason ? (
                  <p>
                    {t("audit.reason")}: {event.reason}
                  </p>
                ) : null}
                <details className="mt-1">
                  <summary className="cursor-pointer">
                    {t("audit.what")}
                  </summary>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <pre className="bg-card overflow-x-auto rounded border p-2 text-xs">
                      {`${t("audit.before")}\n${pretty(event.before)}`}
                    </pre>
                    <pre className="bg-card overflow-x-auto rounded border p-2 text-xs">
                      {`${t("audit.after")}\n${pretty(event.after)}`}
                    </pre>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("audit.empty")}</p>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/audit")({
  component: AuditPage,
});

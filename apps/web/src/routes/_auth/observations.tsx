import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { formatDate } from "@OpenFarm/i18n";

import { useLanguage, useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const WINDOW_DAYS = 7;

/** What the rounds have noticed lately, across the herd. The Manager's question is "which
 *  cows were seen bulling this week", and answering it should not mean opening seven
 *  Instances and remembering what was in them. */
const ObservationsPage = () => {
  const t = useT();
  const { language } = useLanguage();
  const [saw, setSaw] = useState<string>("");

  const kinds = useQuery(orpc.observations.kinds.queryOptions());
  const seen = useQuery(
    orpc.observations.recent.queryOptions({
      input: { days: WINDOW_DAYS, ...(saw ? { saw } : {}) },
    })
  );

  return (
    <div className="container mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="font-medium text-lg">{t("observations.title")}</h1>
      <p className="text-muted-foreground text-sm">
        {t("observations.days", { days: WINDOW_DAYS })}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-md border px-3 py-1 text-sm ${saw === "" ? "bg-neutral-800 text-neutral-100" : ""}`}
          onClick={() => setSaw("")}
          type="button"
        >
          {t("observations.all")}
        </button>
        {(kinds.data ?? []).map((kind) => (
          <button
            className={`rounded-md border px-3 py-1 text-sm ${saw === kind.saw ? "bg-neutral-800 text-neutral-100" : ""}`}
            key={kind.saw}
            onClick={() => setSaw(kind.saw)}
            type="button"
          >
            {kind.label}
          </button>
        ))}
      </div>

      {seen.data?.length ? (
        <ul className="space-y-2">
          {seen.data.map((row) => (
            <li className="rounded-lg border p-3 text-sm" key={row.id}>
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  className="font-medium underline"
                  params={{ tagNumber: row.tagNumber }}
                  to="/animals/$tagNumber"
                >
                  {row.tagNumber}
                </Link>
                <span>{row.sawLabel}</span>
              </div>
              <div className="text-muted-foreground">
                {formatDate(new Date(row.seenAt), language, "dateTime")}
                {row.seenByName ? ` · ${row.seenByName}` : ""}
                {" · "}
                <Link
                  className="underline"
                  params={{ instanceId: row.instanceId }}
                  to="/work/$instanceId"
                >
                  {t("animals.moveFromWork")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("observations.none")}
        </p>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/observations")({
  component: ObservationsPage,
});

import { formatDate } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { useState } from "react";

import { EmptyState, Page, PageHeader } from "@/components/page";
import { SawFilter } from "@/components/saw-filter";
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
    <Page width="narrow" className="max-w-3xl">
      <PageHeader
        description={t("observations.days", { days: WINDOW_DAYS })}
        title={t("observations.title")}
      />

      <SawFilter chosen={saw} kinds={kinds.data ?? []} onChoose={setSaw} />

      {seen.data?.length ? (
        <ul className="space-y-2">
          {seen.data.map((row) => (
            <li className="surface p-4 text-sm" key={row.id}>
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
        <EmptyState icon={Eye} title={t("observations.none")} />
      )}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/observations")({
  component: ObservationsPage,
});

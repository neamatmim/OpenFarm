import { formatDate } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { useState } from "react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Page, PageHeader } from "@/components/page";
import { SawFilter } from "@/components/saw-filter";
import { useLanguage, useT } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

const WINDOW_DAYS = 7;

type Seen = Awaited<ReturnType<typeof orpc.observations.recent.call>>[number];

/** Where an Observation came from: the work that asked for it, or somebody saying so unasked. */
const SeenFrom = ({ row }: { row: Seen }) => {
  const t = useT();
  if (!row.instanceId) {
    return t("sighting.reported");
  }
  return (
    <Link
      className="underline"
      params={{ instanceId: row.instanceId }}
      to="/work/$instanceId"
    >
      {t("animals.moveFromWork")}
    </Link>
  );
};

interface SeenCell {
  row: { original: Seen };
}

const TagCell = ({ row }: SeenCell) => (
  <Link
    className="font-mono font-semibold tabular-nums underline-offset-4 hover:underline"
    params={{ tagNumber: row.original.tagNumber }}
    to="/animals/$tagNumber"
  >
    {row.original.tagNumber}
  </Link>
);

const WhenCell = ({ row }: SeenCell) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatDate(new Date(row.original.seenAt), language, "dateTime")}
    </span>
  );
};

const FromCell = ({ row }: SeenCell) => <SeenFrom row={row.original} />;

const NoteCell = ({ row }: SeenCell) =>
  row.original.note ? (
    <span className="text-muted-foreground">“{row.original.note}”</span>
  ) : null;

const column = createListColumns<Seen>();
const seenColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor("sawLabel", { header: listHeader("observations.col.saw") }),
  column.accessor((row) => new Date(row.seenAt), {
    id: "seenAt",
    header: listHeader("observations.col.when"),
    cell: WhenCell,
  }),
  column.accessor((row) => row.seenByName ?? "", {
    id: "seenBy",
    header: listHeader("observations.col.by"),
  }),
  column.display({
    id: "from",
    header: listHeader("observations.col.from"),
    cell: FromCell,
  }),
  column.display({
    id: "note",
    header: listHeader("work.note"),
    cell: NoteCell,
    meta: { className: "min-w-48" },
  }),
]);

/** The week's Observations as a table where there is room: which cow, what was seen, when and by whom, one to a row,
 *  newest first until a heading is pressed. */
const SeenTable = ({ seen }: { seen: Seen[] }) => {
  const table = useListTable({
    columns: seenColumns,
    data: seen,
    getRowId: (row) => row.id,
  });
  return (
    <div className="bg-card hidden rounded-xl border md:block">
      <DataTable bare minWidth="48rem" table={table} />
    </div>
  );
};

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
    <Page>
      <PageHeader
        description={t("observations.days", { days: WINDOW_DAYS })}
        title={t("observations.title")}
      />

      <SawFilter chosen={saw} kinds={kinds.data ?? []} onChoose={setSaw} />

      {seen.data?.length ? (
        <>
          <ul className="space-y-2 md:hidden">
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
                  <SeenFrom row={row} />
                  {row.note ? ` · “${row.note}”` : ""}
                </div>
              </li>
            ))}
          </ul>
          <SeenTable seen={seen.data} />
        </>
      ) : (
        <EmptyState icon={Eye} title={t("observations.none")} />
      )}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/observations")({
  beforeLoad: onlyFor("vetOrRunsTheFarm", { visitors: false }),
  component: ObservationsPage,
});

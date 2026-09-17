import { formatDate } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Eye, Search } from "lucide-react";
import { useState } from "react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  TagChip,
} from "@/components/page";
import { FilterBar, NativeSelect } from "@/components/page-kit";
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
      className="underline underline-offset-4"
      params={{ instanceId: row.instanceId }}
      to="/work/$instanceId"
    >
      {t("animals.moveFromWork")}
    </Link>
  );
};

/** The cow's Tag Number, opening her record. */
const SeenTag = ({ row }: { row: Seen }) => (
  <Link
    className="rounded-md outline-none focus-visible:ring-2"
    params={{ tagNumber: row.tagNumber }}
    to="/animals/$tagNumber"
  >
    <TagChip>{row.tagNumber}</TagChip>
  </Link>
);

interface SeenCell {
  row: { original: Seen };
}

const TagCell = ({ row }: SeenCell) => <SeenTag row={row.original} />;

const SawCell = ({ row }: SeenCell) => (
  <span className="font-medium">{row.original.sawLabel}</span>
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
  column.accessor("sawLabel", {
    header: listHeader("observations.col.saw"),
    cell: SawCell,
  }),
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

/** An Observation on a phone: which cow and what was seen on one line, when and by whom beneath, and the note. */
const SeenCard = ({ row }: { row: Seen }) => {
  const { language } = useLanguage();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <SeenTag row={row} />
        <span className="font-medium">{row.sawLabel}</span>
      </div>
      <span className="text-muted-foreground text-sm">
        <span className="tabular-nums">
          {formatDate(new Date(row.seenAt), language, "dateTime")}
        </span>
        {row.seenByName ? ` · ${row.seenByName}` : ""}
        {" · "}
        <SeenFrom row={row} />
      </span>
      {row.note ? (
        <span className="text-muted-foreground text-sm">“{row.note}”</span>
      ) : null}
    </div>
  );
};

const seenCard = (row: Seen) => <SeenCard row={row} />;

/** The week's Observations: a table where there is room, cards on a phone, newest first until a heading is pressed,
 *  read twenty at a time. */
const SeenTable = ({ seen }: { seen: Seen[] }) => {
  const table = useListTable({
    columns: seenColumns,
    data: seen,
    getRowId: (row) => row.id,
  });
  return (
    <DataTable card={seenCard} minWidth="52rem" pageSize={20} table={table} />
  );
};

/** What the rounds have noticed lately, across the herd. The Manager's question is "which
 *  cows were seen bulling this week", and answering it should not mean opening seven
 *  Instances and remembering what was in them. What was seen is asked of the farm; a Tag
 *  Number narrows what came back. */
const ObservationsPage = () => {
  const t = useT();
  const [saw, setSaw] = useState<string>("");
  const [tag, setTag] = useState("");

  const kinds = useQuery(orpc.observations.kinds.queryOptions());
  const seen = useQuery(
    orpc.observations.recent.queryOptions({
      input: { days: WINDOW_DAYS, ...(saw ? { saw } : {}) },
    })
  );
  const wanted = tag.trim().toLowerCase();
  const shown = (seen.data ?? []).filter(
    (row) => wanted === "" || row.tagNumber.toLowerCase().includes(wanted)
  );

  return (
    <Page>
      <PageHeader
        description={t("observations.days", { days: WINDOW_DAYS })}
        title={t("observations.title")}
      />

      <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
        <FilterBar>
          <NativeSelect
            aria-label={t("observations.col.saw")}
            className="sm:w-56"
            onChange={(event) => setSaw(event.target.value)}
            value={saw}
          >
            <option value="">{t("observations.all")}</option>
            {(kinds.data ?? []).map((kind) => (
              <option key={kind.saw} value={kind.saw}>
                {kind.label}
              </option>
            ))}
          </NativeSelect>
          <div className="relative sm:w-64">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              aria-label={t("animals.search")}
              className="pl-9"
              onChange={(event) => setTag(event.target.value)}
              placeholder={t("animals.searchPlaceholder")}
              type="search"
              value={tag}
            />
          </div>
        </FilterBar>

        <Loaded query={seen}>
          {shown.length ? (
            <SeenTable seen={shown} />
          ) : (
            <EmptyState bare icon={Eye} title={t("observations.none")} />
          )}
        </Loaded>
      </div>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/observations")({
  beforeLoad: onlyFor("vetOrRunsTheFarm", { visitors: false }),
  component: ObservationsPage,
});

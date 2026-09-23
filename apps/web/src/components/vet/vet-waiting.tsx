import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Stethoscope } from "lucide-react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Nothing, SaidDate } from "@/components/list-cells";
import { EmptyState, Loaded } from "@/components/page";
import { SawFilter } from "@/components/saw-filter";
import { useLanguage } from "@/i18n/language-provider";

import type { Seen } from "./vet-types";
import { AnimalLink } from "./vet-types";

/** How many things seen a page shows before the next. */
const WAITING_PAGE = 20;

interface WaitingRow extends Seen {
  handleAnswer: (seen: Seen) => void;
}

const AnimalCell = ({ row }: { row: { original: WaitingRow } }) => (
  <AnimalLink tagNumber={row.original.tagNumber} />
);

const SawCell = ({ row }: { row: { original: WaitingRow } }) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-medium">{row.original.sawLabel}</span>
    {row.original.note ? (
      <span className="text-muted-foreground text-sm">
        “{row.original.note}”
      </span>
    ) : null}
  </div>
);

const SeenByCell = ({ row }: { row: { original: WaitingRow } }) =>
  row.original.seenByName ?? <Nothing />;

const SeenAtCell = ({ row }: { row: { original: WaitingRow } }) => (
  <span className="whitespace-nowrap tabular-nums">
    <SaidDate at={row.original.seenAt} withTime />
  </span>
);

/** The one thing the Vet does with what a round saw: answer it. */
const AnswerButton = ({
  row,
  className,
}: {
  row: WaitingRow;
  className?: string;
}) => {
  const { t } = useLanguage();
  const { handleAnswer } = row;
  return (
    <Button
      className={className}
      onClick={() => handleAnswer(row)}
      size="sm"
      type="button"
      variant="outline"
    >
      <Stethoscope aria-hidden data-icon="inline-start" />
      {t("vet.record")}
    </Button>
  );
};

const AnswerCell = ({ row }: { row: { original: WaitingRow } }) => (
  <AnswerButton row={row.original} />
);

const column = createListColumns<WaitingRow>();
const waitingColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: AnimalCell,
  }),
  column.accessor("sawLabel", {
    header: listHeader("observations.col.saw"),
    cell: SawCell,
  }),
  column.accessor((seen) => seen.seenByName ?? undefined, {
    id: "seenBy",
    header: listHeader("observations.col.by"),
    cell: SeenByCell,
  }),
  column.accessor((seen) => new Date(seen.seenAt).getTime(), {
    id: "seenAt",
    header: listHeader("observations.col.when"),
    cell: SeenAtCell,
  }),
  column.display({
    id: "answer",
    header: ActionsHeader,
    cell: AnswerCell,
    meta: { align: "end" },
  }),
]);

/** Something seen, on a phone: the animal and the word on one line, when and by whom beneath, and the answer. */
const WaitingCard = ({ row }: { row: WaitingRow }) => {
  const { language } = useLanguage();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <AnimalLink tagNumber={row.tagNumber} />
        <span className="font-medium">{row.sawLabel}</span>
      </div>
      {row.note ? <p className="text-sm">“{row.note}”</p> : null}
      <span className="text-muted-foreground text-xs">
        {formatDate(new Date(row.seenAt), language, "dateTime")}
        {row.seenByName ? ` · ${row.seenByName}` : ""}
      </span>
      <AnswerButton className="h-11 self-start" row={row} />
    </div>
  );
};

const waitingCard = (row: WaitingRow) => <WaitingCard row={row} />;

const WaitingList = ({ rows }: { rows: WaitingRow[] }) => {
  const table = useListTable({
    columns: waitingColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return (
    <DataTable
      card={waitingCard}
      minWidth="44rem"
      pageSize={WAITING_PAGE}
      table={table}
    />
  );
};

/**
 * What the rounds have seen and nobody has answered, newest first, each with the Vet's answer a tap away.
 *
 * Every choice a round offers is written down, the ones that say she is well included, and nothing in an SOP says which
 * of them wants a Vet. So the Vet narrows the list by the word the farm used.
 */
export const WaitingTab = ({
  waiting,
  kinds,
  saw,
  onSaw,
  onAnswer,
}: {
  waiting: {
    data: Seen[] | undefined;
    isError: boolean;
    refetch: () => unknown;
  };
  kinds: { saw: string; label: string }[];
  saw: string;
  onSaw: (saw: string) => void;
  onAnswer: (seen: Seen) => void;
}) => {
  const { t } = useLanguage();
  const rows = (waiting.data ?? []).map((seen) => ({
    ...seen,
    handleAnswer: onAnswer,
  }));
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      {kinds.length > 0 ? (
        <div className="border-b pb-4">
          <SawFilter chosen={saw} kinds={kinds} onChoose={onSaw} />
        </div>
      ) : null}
      <Loaded query={waiting}>
        {rows.length === 0 ? (
          <EmptyState bare title={t("vet.nothingWaiting")} />
        ) : (
          <WaitingList key={saw} rows={rows} />
        )}
      </Loaded>
    </div>
  );
};

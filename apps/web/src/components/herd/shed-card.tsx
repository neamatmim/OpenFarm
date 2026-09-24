import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Fence, PencilLine, Plus, Warehouse } from "lucide-react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, StatusBadge } from "@/components/page";
import { RowMenu } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

/** A Shed as the page reads it: its name and the Pens inside it. */
export interface ShedRow {
  id: string;
  name: string;
  pens: { id: string; name: string }[];
}

/** What a Shed's card can ask the page for: a new Pen in it, or a new name for it or one of its Pens. */
export interface ShedActions {
  handleAddPen: (shed: ShedRow) => void;
  handleRenameShed: (shed: ShedRow) => void;
  handleRenamePen: (pen: { id: string; name: string }) => void;
}

interface PenRow {
  id: string;
  name: string;
  animals: number;
  actions: ShedActions;
}

interface PenCell {
  row: { original: PenRow };
}

/** How many animals, as the farm counts them. */
const HeadCount = ({ count }: { count: number }) => {
  const { t, language } = useLanguage();
  return (
    <span className="text-muted-foreground whitespace-nowrap tabular-nums">
      {t("herd.animalCount", { count: formatNumber(count, language) })}
    </span>
  );
};

/** A Pen's one act: a new name. The word beside the pencil where there is room for it. */
const RenamePen = ({ row }: { row: PenRow }) => {
  const { t } = useLanguage();
  return (
    <Button
      aria-label={`${t("herd.rename")}: ${row.name}`}
      onClick={() => row.actions.handleRenamePen(row)}
      type="button"
      variant="ghost"
    >
      <PencilLine aria-hidden />
      <span className="sr-only sm:not-sr-only">{t("herd.rename")}</span>
    </Button>
  );
};

const NameCell = ({ row }: PenCell) => (
  <span className="font-medium">{row.original.name}</span>
);

const AnimalsCell = ({ row }: PenCell) => (
  <HeadCount count={row.original.animals} />
);

const RenameCell = ({ row }: PenCell) => (
  <div className="-my-1.5 flex justify-end">
    <RenamePen row={row.original} />
  </div>
);

const column = createListColumns<PenRow>();
const penColumns = column.columns([
  column.accessor("name", {
    header: listHeader("herd.col.pen"),
    cell: NameCell,
  }),
  column.accessor("animals", {
    header: listHeader("herd.col.animals"),
    cell: AnimalsCell,
    meta: { align: "end" },
  }),
  column.display({
    id: "rename",
    header: ActionsHeader,
    cell: RenameCell,
    meta: { align: "end", className: "w-32" },
  }),
]);

/** A Pen on a phone: its name, how many are in it, and renaming it at the right. */
const PenCard = ({ row }: { row: PenRow }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-medium">{row.name}</span>
      <span className="text-sm">
        <HeadCount count={row.animals} />
      </span>
    </div>
    <RenamePen row={row} />
  </div>
);

const penCard = (row: PenRow) => <PenCard row={row} />;

/**
 * One Shed: its name, how many animals stand in it and in how many Pens, and the Pens themselves as a list with their
 * head counts. A new Pen is added at the card's foot; the Shed's own name is changed from its menu.
 */
export const ShedCard = ({
  shed,
  inPen,
  actions,
}: {
  shed: ShedRow;
  /** How many animals stand in each Pen, by the Pen's id. */
  inPen: Map<string, number>;
  actions: ShedActions;
}) => {
  const { t, language } = useLanguage();
  const pens = shed.pens.map((pen) => ({
    id: pen.id,
    name: pen.name,
    animals: inPen.get(pen.id) ?? 0,
    actions,
  }));
  const table = useListTable({
    columns: penColumns,
    data: pens,
    getRowId: (row) => row.id,
  });
  const total = pens.reduce((sum, pen) => sum + pen.animals, 0);
  return (
    <section
      aria-label={shed.name}
      className="surface flex flex-col gap-3 p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-secondary text-secondary-foreground grid size-10 shrink-0 place-items-center rounded-lg">
            <Warehouse aria-hidden className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate text-base font-semibold tracking-tight">
              {shed.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge tone="neutral">
                {t("herd.animalCount", {
                  count: formatNumber(total, language),
                })}
              </StatusBadge>
              <span className="text-muted-foreground">
                {t("herd.penCount", {
                  count: formatNumber(pens.length, language),
                })}
              </span>
            </div>
          </div>
        </div>
        <RowMenu
          actions={[
            {
              label: t("herd.rename"),
              icon: PencilLine,
              handleSelect: () => actions.handleRenameShed(shed),
            },
          ]}
          label={t("stock.rowActions", { name: shed.name })}
        />
      </div>

      {pens.length > 0 ? (
        <DataTable card={penCard} minWidth="20rem" table={table} />
      ) : (
        <EmptyState bare icon={Fence} title={t("herd.noPens")} />
      )}

      <div>
        <Button
          onClick={() => actions.handleAddPen(shed)}
          type="button"
          variant="outline"
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t("herd.addPen")}
        </Button>
      </div>
    </section>
  );
};

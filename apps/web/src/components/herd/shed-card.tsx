import { stockingOf } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Fence, PencilLine, Plus, Ruler, Warehouse } from "lucide-react";

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
  /** `quarantine` is missing from an answer kept from before pens were marked: read as unmarked; `head` and
   *  `capacity` from one kept from before Pens were counted. */
  pens: {
    id: string;
    name: string;
    quarantine?: boolean;
    head?: number;
    capacity?: number | null;
  }[];
}

/** What a Shed's card can ask the page for: a new Pen in it, or a new name for it or one of its Pens. */
export interface ShedActions {
  handleAddPen: (shed: ShedRow) => void;
  handleRenameShed: (shed: ShedRow) => void;
  handleRenamePen: (pen: { id: string; name: string }) => void;
  /** Marked as a quarantine pen, or not. */
  handleMarkQuarantine: (pen: { id: string }, quarantine: boolean) => void;
  /** How many head it holds. */
  handleSetCapacity: (pen: {
    id: string;
    name: string;
    capacity: number | null;
  }) => void;
}

interface PenRow {
  id: string;
  name: string;
  quarantine: boolean;
  animals: number;
  capacity: number | null;
  actions: ShedActions;
}

interface PenCell {
  row: { original: PenRow };
}

/** How many animals stand in a Pen — against the head it holds, once somebody has said, and how many over. */
const HeadCount = ({
  count,
  capacity,
}: {
  count: number;
  capacity: number | null;
}) => {
  const { t, language } = useLanguage();
  const stocking = stockingOf(count, capacity);
  if (stocking === null) {
    return (
      <span className="text-muted-foreground whitespace-nowrap tabular-nums">
        {t("herd.animalCount", { count: formatNumber(count, language) })}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2 whitespace-nowrap tabular-nums">
      <span className="text-muted-foreground">
        {t("herd.headOfCapacity", {
          head: formatNumber(stocking.head, language),
          capacity: formatNumber(stocking.capacity, language),
        })}
      </span>
      {stocking.over > 0 ? (
        <StatusBadge tone="warning">
          {t("herd.overCapacity", {
            count: formatNumber(stocking.over, language),
          })}
        </StatusBadge>
      ) : null}
    </span>
  );
};

/** A Pen's name, and the mark of a quarantine pen beside it. */
const PenName = ({ row }: { row: PenRow }) => {
  const { t } = useLanguage();
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="truncate font-medium">{row.name}</span>
      {row.quarantine ? (
        <StatusBadge tone="warning">{t("herd.quarantinePen")}</StatusBadge>
      ) : null}
    </span>
  );
};

/** Whether this is a quarantine pen: where bought animals come in and are kept until released. */
const QuarantineMark = ({ row }: { row: PenRow }) => {
  const { t } = useLanguage();
  return (
    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
      <Checkbox
        checked={row.quarantine}
        onCheckedChange={(checked) =>
          row.actions.handleMarkQuarantine(row, checked === true)
        }
      />
      {t("herd.quarantinePen")}
    </label>
  );
};

/** What a Pen's row can ask for beyond marking it: the head it holds, and a new name. */
const PenMenu = ({ row }: { row: PenRow }) => {
  const { t } = useLanguage();
  return (
    <RowMenu
      actions={[
        {
          label: t("herd.setCapacity"),
          icon: Ruler,
          handleSelect: () => row.actions.handleSetCapacity(row),
        },
        {
          label: t("herd.rename"),
          icon: PencilLine,
          handleSelect: () => row.actions.handleRenamePen(row),
        },
      ]}
      label={t("stock.rowActions", { name: row.name })}
    />
  );
};

const NameCell = ({ row }: PenCell) => <PenName row={row.original} />;

const AnimalsCell = ({ row }: PenCell) => (
  <HeadCount capacity={row.original.capacity} count={row.original.animals} />
);

const RenameCell = ({ row }: PenCell) => (
  <div className="flex items-center justify-end gap-3">
    <QuarantineMark row={row.original} />
    <PenMenu row={row.original} />
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
    meta: { align: "end", className: "w-64" },
  }),
]);

/** A Pen on a phone: its name, how many are in it, and its menu at the right. */
const PenCard = ({ row }: { row: PenRow }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex min-w-0 flex-col gap-0.5">
      <PenName row={row} />
      <span className="text-sm">
        <HeadCount capacity={row.capacity} count={row.animals} />
      </span>
      <QuarantineMark row={row} />
    </div>
    <PenMenu row={row} />
  </div>
);

const penCard = (row: PenRow) => <PenCard row={row} />;

/**
 * One Shed: its name, how many animals stand in it and in how many Pens, and the Pens themselves as a list with their
 * head counts. A new Pen is added at the card's foot; the Shed's own name is changed from its menu.
 */
export const ShedCard = ({
  shed,
  actions,
}: {
  shed: ShedRow;
  actions: ShedActions;
}) => {
  const { t, language } = useLanguage();
  const pens = shed.pens.map((pen) => ({
    id: pen.id,
    name: pen.name,
    quarantine: pen.quarantine === true,
    animals: pen.head ?? 0,
    capacity: pen.capacity ?? null,
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
            <h2 className="truncate text-base font-semibold">{shed.name}</h2>
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

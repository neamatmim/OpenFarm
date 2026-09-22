import { formatNumber } from "@OpenFarm/i18n";
import { Button, buttonVariants } from "@OpenFarm/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Store } from "lucide-react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { TagLink } from "@/components/fattening/fattening-words";
import { EmptyState } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

export type Sellable = Awaited<
  ReturnType<typeof orpc.sale.sellable.call>
>[number];

interface SellableRow extends Sellable {
  handleSell: (tagNumber: string) => void;
}

interface SellableCell {
  row: { original: SellableRow };
}

/** The one act on a Ready animal from here: selling her, with her already chosen in the sheet. */
const SellButton = ({ row }: { row: SellableRow }) => {
  const { t } = useLanguage();
  const { handleSell } = row;
  return (
    <Button onClick={() => handleSell(row.tagNumber)} size="sm" type="button">
      <Store aria-hidden data-icon="inline-start" />
      {t("sale.sellThis")}
    </Button>
  );
};

const TagCell = ({ row }: SellableCell) => (
  <TagLink tagNumber={row.original.tagNumber} />
);

/** What she last weighed, or a dash for one never on the scale. */
const LastWeight = ({ kg }: { kg: number | null }) => {
  const { t, language } = useLanguage();
  if (kg === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="whitespace-nowrap">
      {t("intake.kg", { kg: formatNumber(kg, language) })}
    </span>
  );
};

const WeightCell = ({ row }: SellableCell) => (
  <LastWeight kg={row.original.latestKg} />
);

const SellCell = ({ row }: SellableCell) => (
  <div className="flex justify-end">
    <SellButton row={row.original} />
  </div>
);

const column = createListColumns<SellableRow>();
const sellableColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor("penName", { header: listHeader("animals.pen") }),
  column.accessor((row) => row.latestKg ?? undefined, {
    id: "latestKg",
    header: listHeader("sale.col.lastWeighed"),
    cell: WeightCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.display({
    id: "sell",
    header: ActionsHeader,
    cell: SellCell,
    meta: { align: "end" },
  }),
]);

/** A Ready animal on a phone: her tag and pen, what she last weighed, and the button that sells her. */
const SellableCard = ({ row }: { row: SellableRow }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <TagLink tagNumber={row.tagNumber} />
        <span className="text-muted-foreground text-sm">{row.penName}</span>
      </div>
      <span className="font-semibold tabular-nums">
        <LastWeight kg={row.latestKg} />
      </span>
    </div>
    <SellButton row={row} />
  </div>
);

const sellableCard = (row: SellableRow) => <SellableCard row={row} />;

/**
 * The animals that can go this morning — confirmed Ready and clear of their days — each one button from the sale
 * sheet with her already chosen. When there are none, the way to the suggestions the Manager has still to answer.
 */
export const ReadyToGo = ({
  sellable,
  onSell,
}: {
  sellable: Sellable[];
  onSell: (tagNumber: string) => void;
}) => {
  const { t } = useLanguage();
  const table = useListTable({
    columns: sellableColumns,
    data: sellable.map((row) => ({ ...row, handleSell: onSell })),
    getRowId: (row) => row.id,
  });
  if (sellable.length === 0) {
    return (
      <EmptyState
        action={
          <Link className={buttonVariants({ variant: "outline" })} to="/ready">
            {t("nav.ready")}
          </Link>
        }
        description={t("sale.noneReadyHint")}
        icon={Store}
        title={t("sale.noneReady")}
      />
    );
  }
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      <DataTable
        card={sellableCard}
        minWidth="36rem"
        pageSize={20}
        table={table}
      />
    </div>
  );
};

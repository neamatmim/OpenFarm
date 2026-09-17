import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@OpenFarm/ui/components/dropdown-menu";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  EllipsisVertical,
  PackagePlus,
  Warehouse,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import type { Tone } from "@/components/page";
import { EmptyState, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

import type { StockLine, StockStanding } from "./feed-types";
import { standingOf, valueOf } from "./feed-types";

const STANDING_TONE: Record<StockStanding, Tone> = {
  out: "danger",
  low: "warning",
  ok: "success",
  unwatched: "neutral",
};

/** What the page does when a row's menu is used: feed in for this item, or the level it is watched at. */
interface StockActions {
  mayRecord: boolean;
  handleReceive: (feedItemId: string) => void;
  handleSetLevel: (line: StockLine) => void;
}

interface StockRow extends StockLine {
  actions: StockActions;
}

/** A Feed Item's standing, as a word with its colour. */
const Standing = ({ line }: { line: StockLine }) => {
  const { t } = useLanguage();
  const standing = standingOf(line);
  return (
    <StatusBadge tone={STANDING_TONE[standing]}>
      {t(`stock.status.${standing}`)}
    </StatusBadge>
  );
};

const NameCell = ({ row }: { row: { original: StockRow } }) => (
  <span className="font-medium">{row.original.nameBn}</span>
);

const StandingCell = ({ row }: { row: { original: StockRow } }) => (
  <Standing line={row.original} />
);

const OnHandCell = ({ row }: { row: { original: StockRow } }) => {
  const { language } = useLanguage();
  const line = row.original;
  return (
    <span
      className={cn(
        "font-medium whitespace-nowrap",
        standingOf(line) === "out" && "text-danger",
        standingOf(line) === "low" && "text-warning"
      )}
    >
      {formatNumber(line.onHand, language)} {line.unit}
    </span>
  );
};

const AveragePriceCell = ({ row }: { row: { original: StockRow } }) => {
  const { t, language } = useLanguage();
  const line = row.original;
  if (line.averagePriceBdt === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="whitespace-nowrap">
      {t("stock.averagePrice", {
        taka: formatNumber(line.averagePriceBdt, language),
        unit: line.unit,
      })}
    </span>
  );
};

const ValueCell = ({ row }: { row: { original: StockRow } }) => {
  const { language } = useLanguage();
  const value = valueOf(row.original);
  if (value === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="whitespace-nowrap">
      ৳{formatNumber(Math.round(value), language)}
    </span>
  );
};

const LowAtCell = ({ row }: { row: { original: StockRow } }) => {
  const { language } = useLanguage();
  const line = row.original;
  if (line.lowStockAt === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="whitespace-nowrap">
      {formatNumber(line.lowStockAt, language)} {line.unit}
    </span>
  );
};

/** The menu at the end of a Feed Item's row: feed in for it, or the level it is watched at. */
const RowMenu = ({
  line,
  actions,
}: {
  line: StockLine;
  actions: StockActions;
}) => {
  const { t } = useLanguage();
  const { handleReceive, handleSetLevel } = actions;
  if (!actions.mayRecord || line.retiredAt) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("stock.rowActions", { name: line.nameBn })}
            size="icon-sm"
            variant="ghost"
          >
            <EllipsisVertical aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => handleReceive(line.feedItemId)}>
          <PackagePlus aria-hidden />
          {t("stock.recordArrival")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSetLevel(line)}>
          <BellRing aria-hidden />
          {t("stock.setLevel")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const MenuCell = ({ row }: { row: { original: StockRow } }) => (
  <div className="flex justify-end">
    <RowMenu actions={row.original.actions} line={row.original} />
  </div>
);

const column = createListColumns<StockRow>();
const stockColumns = column.columns([
  column.accessor("nameBn", {
    header: listHeader("stock.col.item"),
    cell: NameCell,
  }),
  column.accessor(
    (line) => ["out", "low", "ok", "unwatched"].indexOf(standingOf(line)),
    {
      id: "standing",
      header: listHeader("stock.col.status"),
      cell: StandingCell,
    }
  ),
  column.accessor("onHand", {
    header: listHeader("stock.col.onHand"),
    cell: OnHandCell,
    meta: { align: "end" },
  }),
  column.accessor((line) => line.lowStockAt ?? -1, {
    id: "lowAt",
    header: listHeader("stock.col.lowAt"),
    cell: LowAtCell,
    meta: { align: "end" },
  }),
  column.accessor((line) => line.averagePriceBdt ?? -1, {
    id: "averagePrice",
    header: listHeader("stock.col.averagePrice"),
    cell: AveragePriceCell,
    meta: { align: "end" },
  }),
  column.accessor((line) => valueOf(line) ?? -1, {
    id: "value",
    header: listHeader("stock.col.value"),
    cell: ValueCell,
    meta: { align: "end" },
  }),
  column.display({
    id: "menu",
    header: ActionsHeader,
    cell: MenuCell,
    meta: { align: "end", className: "w-12" },
  }),
]);

/** A Feed Item on a phone: its name and standing on one line, what the store holds large beneath. */
const StockCard = ({ row }: { row: StockRow }) => {
  const { t, language } = useLanguage();
  const value = valueOf(row);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.nameBn}</span>
          <Standing line={row} />
        </div>
        <span className="text-lg font-semibold tabular-nums">
          {formatNumber(row.onHand, language)} {row.unit}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {row.averagePriceBdt === null
            ? t("stock.harvest")
            : `${t("stock.averagePrice", {
                taka: formatNumber(row.averagePriceBdt, language),
                unit: row.unit,
              })} · ৳${formatNumber(Math.round(value ?? 0), language)}`}
          {row.lowStockAt === null
            ? ""
            : ` · ${t("stock.col.lowAt")} ${formatNumber(row.lowStockAt, language)} ${row.unit}`}
        </span>
      </div>
      <RowMenu actions={row.actions} line={row} />
    </div>
  );
};

const stockCard = (row: StockRow) => <StockCard row={row} />;

/** The level a Feed Item is watched at, set in a dialog: blank for one nobody watches. */
const LevelDialog = ({
  line,
  onOpenChange,
}: {
  line: StockLine | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(
    line?.lowStockAt === null || line === null ? "" : String(line.lowStockAt)
  );
  const save = useMutation(
    orpc.feed.setLowStock.mutationOptions({
      onSuccess: async () => {
        toast.success(t("stock.levelSaved"));
        onOpenChange(false);
        // The level decides what is on the home queues as well as this screen.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.stock.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.home.key() }),
        ]);
      },
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={line !== null}>
      <DialogContent closeLabel={t("common.close")}>
        {line ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate({
                feedItemId: line.feedItemId,
                threshold: value.trim() === "" ? null : Number(value),
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {t("stock.setLevel")} — {line.nameBn}
              </DialogTitle>
              <DialogDescription>{t("stock.levelHint")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="level-value">
                {t("stock.quantity", { unit: line.unit })}
              </Label>
              <Input
                id="level-value"
                inputMode="decimal"
                min={0.1}
                onChange={(event) => setValue(event.target.value)}
                step="0.1"
                type="number"
                value={value}
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={save.isPending} type="submit">
                {save.isPending ? <Spinner /> : null}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

/**
 * What is in the store, a row per Feed Item still fed: how it stands against its level, what it holds, what a unit cost
 * and what it is all worth. The row's menu takes feed in for it or sets its level.
 */
export const StockTab = ({
  lines,
  mayRecord,
  onReceive,
}: {
  lines: StockLine[];
  mayRecord: boolean;
  onReceive: (feedItemId: string) => void;
}) => {
  const { t } = useLanguage();
  const [levelFor, setLevelFor] = useState<StockLine | null>(null);
  const live = lines.filter((line) => !line.retiredAt);
  const actions: StockActions = {
    mayRecord,
    handleReceive: onReceive,
    handleSetLevel: setLevelFor,
  };
  const table = useListTable({
    columns: stockColumns,
    data: live.map((line) => ({ ...line, actions })),
    getRowId: (row) => row.feedItemId,
  });
  if (live.length === 0) {
    return <EmptyState icon={Warehouse} title={t("stock.noStock")} />;
  }
  return (
    <div className="bg-card rounded-xl border p-4 md:p-5">
      <DataTable card={stockCard} minWidth="52rem" table={table} />
      <LevelDialog
        key={levelFor?.feedItemId ?? "none"}
        line={levelFor}
        onOpenChange={(open) => {
          if (!open) {
            setLevelFor(null);
          }
        }}
      />
    </div>
  );
};

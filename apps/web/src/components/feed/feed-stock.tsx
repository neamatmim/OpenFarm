import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { BellRing, PackagePlus, Sprout, Warehouse } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { LotAndExpiry } from "@/components/expiry";
import { Nothing, SaidDate } from "@/components/list-cells";
import { useIsOwner } from "@/components/money";
import type { Tone } from "@/components/page";
import { EmptyState, StatusBadge } from "@/components/page";
import { FormDialog, FormField, RowMenu } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
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
  /** What the farm's own fodder is worth is the Owner's to say, and nobody else's. */
  maySetFodderPrice: boolean;
  handleReceive: (feedItemId: string) => void;
  handleSetLevel: (line: StockLine) => void;
  handleSetFodderPrice: (line: StockLine) => void;
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
    return <Nothing />;
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
    return <Nothing />;
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
    return <Nothing />;
  }
  return (
    <span className="whitespace-nowrap">
      {formatNumber(line.lowStockAt, language)} {line.unit}
    </span>
  );
};

/** The menu at the end of a Feed Item's row: feed in for it, the level it is watched at, and — the
 *  Owner's alone — what a kilo of it is worth when the farm grows it itself. */
const StockRowMenu = ({
  line,
  actions,
}: {
  line: StockLine;
  actions: StockActions;
}) => {
  const { t } = useLanguage();
  const { handleReceive, handleSetLevel, handleSetFodderPrice } = actions;
  if (!actions.mayRecord || line.retiredAt) {
    return null;
  }
  return (
    <RowMenu
      actions={[
        {
          label: t("stock.recordArrival"),
          icon: PackagePlus,
          handleSelect: () => handleReceive(line.feedItemId),
        },
        {
          label: t("stock.setLevel"),
          icon: BellRing,
          handleSelect: () => handleSetLevel(line),
        },
        ...(actions.maySetFodderPrice
          ? [
              {
                label: t("stock.setFodderPrice"),
                icon: Sprout,
                handleSelect: () => handleSetFodderPrice(line),
              },
            ]
          : []),
      ]}
      label={t("stock.rowActions", { name: line.nameBn })}
    />
  );
};

const MenuCell = ({ row }: { row: { original: StockRow } }) => (
  <div className="flex justify-end">
    <StockRowMenu actions={row.original.actions} line={row.original} />
  </div>
);

/** The delivery still in the store that goes off first: its Lot and day, and whether that day is near. The Lot
 *  is the one the day belongs to, so the bag can be found. */
const NextExpiry = ({ line }: { line: StockLine }) => {
  const { t, language } = useLanguage();
  const expired = line.expiredLeft ?? 0;
  if (!(line.nextExpiresOn || expired > 0)) {
    return <Nothing />;
  }
  return (
    <span className="flex flex-col items-start gap-1">
      {line.nextExpiresOn ? (
        <LotAndExpiry
          expiresOn={line.nextExpiresOn}
          lotNumber={line.nextLotNumber ?? null}
          standing={line.nextStanding}
        />
      ) : null}
      {/* Feed already past its day, still in the store: the bags nobody should be feeding. */}
      {expired > 0 ? (
        <span className="text-danger text-xs font-medium">
          {t("stock.expiredLeft", {
            quantity: formatNumber(expired, language),
            unit: line.unit,
          })}
        </span>
      ) : null}
    </span>
  );
};

/** When feed last came in, or a dash for an item nothing has come in of. */
const LastInCell = ({ row }: { row: { original: StockRow } }) => (
  <span className="whitespace-nowrap">
    <SaidDate at={row.original.lastInOn} />
  </span>
);

const NextExpiryCell = ({ row }: { row: { original: StockRow } }) => (
  <NextExpiry line={row.original} />
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
  column.accessor((line) => line.nextExpiresOn ?? undefined, {
    id: "nextExpiry",
    header: listHeader("stock.col.nextExpiry"),
    cell: NextExpiryCell,
  }),
  column.accessor(
    (line) => (line.lastInOn ? new Date(line.lastInOn).getTime() : undefined),
    {
      id: "lastIn",
      header: listHeader("stock.col.lastIn"),
      cell: LastInCell,
    }
  ),
  column.accessor((line) => line.lowStockAt ?? undefined, {
    id: "lowAt",
    header: listHeader("stock.col.lowAt"),
    cell: LowAtCell,
    meta: { align: "end" },
  }),
  column.accessor((line) => line.averagePriceBdt ?? undefined, {
    id: "averagePrice",
    header: listHeader("stock.col.averagePrice"),
    cell: AveragePriceCell,
    meta: { align: "end" },
  }),
  column.accessor((line) => valueOf(line) ?? undefined, {
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
  const taka = useTaka();
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
              })} · ${taka(value ?? 0)}`}
          {row.lowStockAt === null
            ? ""
            : ` · ${t("stock.col.lowAt")} ${formatNumber(row.lowStockAt, language)} ${row.unit}`}
        </span>
        {row.nextExpiresOn ? <NextExpiry line={row} /> : null}
      </div>
      <StockRowMenu actions={row.actions} line={row} />
    </div>
  );
};

const stockCard = (row: StockRow) => <StockCard row={row} />;

/** What each figure is called on the screen that sets it. */
const WORDS = {
  level: {
    title: "stock.setLevel",
    hint: "stock.levelHint",
    saved: "stock.levelSaved",
    label: "stock.quantity",
  },
  fodderPrice: {
    title: "stock.setFodderPrice",
    hint: "stock.fodderPriceHint",
    saved: "stock.fodderPriceSaved",
    label: "stock.perUnit",
  },
} as const;

/** What the Feed Item holds for the figure being set. */
const ofLine = (line: StockLine, kind: "level" | "fodderPrice") =>
  kind === "level" ? line.lowStockAt : line.fodderPriceBdt;

/**
 * One figure a Feed Item carries, set in a dialog: how low it may run before the Manager is told, or what
 * a unit of it is worth when the farm grows it itself. Blank means the farm says nothing — nobody watches
 * it, or it is not something the farm grows.
 */
const FigureDialog = ({
  line,
  kind,
  onOpenChange,
}: {
  line: StockLine | null;
  kind: "level" | "fodderPrice";
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const held = line === null ? null : ofLine(line, kind);
  const [value, setValue] = useState(held === null ? "" : String(held));
  const words = WORDS[kind];
  const level = useMutation(orpc.feed.setLowStock.mutationOptions({}));
  const fodder = useMutation(orpc.feed.setFodderPrice.mutationOptions({}));
  const save = kind === "level" ? level : fodder;
  const onSaved = () => {
    toast.success(t(words.saved));
    onOpenChange(false);
  };
  return (
    <FormDialog
      description={t(words.hint)}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (!line) {
          return;
        }
        const typed = value.trim() === "" ? null : Number(value);
        const done = {
          onSuccess: onSaved,
          onError: refused,
        };
        if (kind === "level") {
          level.mutate({ feedItemId: line.feedItemId, threshold: typed }, done);
        } else {
          fodder.mutate(
            { feedItemId: line.feedItemId, fodderPriceBdt: typed },
            done
          );
        }
      }}
      open={line !== null}
      pending={save.isPending}
      ready={line !== null}
      submitLabel={t("common.save")}
      title={line ? `${t(words.title)} — ${line.nameBn}` : ""}
    >
      {line ? (
        <FormField
          id="figure-value"
          label={t(words.label, { unit: line.unit })}
        >
          <Input
            id="figure-value"
            inputMode="decimal"
            min={kind === "level" ? 0.1 : 0}
            onChange={(event) => setValue(event.target.value)}
            step={kind === "level" ? "0.1" : "0.01"}
            type="number"
            value={value}
          />
        </FormField>
      ) : null}
    </FormDialog>
  );
};

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
  const [fodderFor, setFodderFor] = useState<StockLine | null>(null);
  const maySetFodderPrice = useIsOwner();
  const live = lines.filter((line) => !line.retiredAt);
  const actions: StockActions = {
    mayRecord,
    maySetFodderPrice,
    handleReceive: onReceive,
    handleSetLevel: setLevelFor,
    handleSetFodderPrice: setFodderFor,
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
      <FigureDialog
        key={`level-${levelFor?.feedItemId ?? "none"}`}
        kind="level"
        line={levelFor}
        onOpenChange={(open) => {
          if (!open) {
            setLevelFor(null);
          }
        }}
      />
      <FigureDialog
        key={`fodder-${fodderFor?.feedItemId ?? "none"}`}
        kind="fodderPrice"
        line={fodderFor}
        onOpenChange={(open) => {
          if (!open) {
            setFodderFor(null);
          }
        }}
      />
    </div>
  );
};

import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { ClipboardList, Truck } from "lucide-react";
import { useState } from "react";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { LotAndExpiry } from "@/components/expiry";
import { EmptyState, SegmentedControl, StatusBadge } from "@/components/page";
import { FilterBar, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { amount as amountArrived, day, figure } from "@/lib/correcting";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

import type { Adjustment, Arrival, FeedItemRow } from "./feed-types";

/** How many rows of a history a page shows before the next. */
const HISTORY_PAGE = 20;

/** Feed that came in written up wrong: how much, what it cost, or the day — with the reason. */
const ArrivalCorrection = ({ arrival }: { arrival: Arrival }) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    quantity: amountArrived(arrival.quantity),
    priceBdt: figure(arrival.priceBdt),
    receivedOn: day(arrival.receivedOn),
  });
  const correct = useMutation(orpc.stock.correct.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: arrival.id,
          reason,
          changes: correcting.changes(),
        });
      }}
      ready={correcting.changed}
      title={t("correct.arrival")}
    >
      <CorrectionAnswer
        inputMode="decimal"
        label={t("stock.quantity", { unit: arrival.unit })}
        onChange={(value) => correcting.set("quantity", value)}
        type="number"
        value={correcting.typed.quantity ?? ""}
      />
      {arrival.priceBdt === null ? null : (
        <CorrectionAnswer
          inputMode="numeric"
          label={t("stock.price")}
          onChange={(value) => correcting.set("priceBdt", value)}
          type="number"
          value={correcting.typed.priceBdt ?? ""}
        />
      )}
      <CorrectionAnswer
        label={t("stock.receivedOn")}
        onChange={(value) => correcting.set("receivedOn", value)}
        type="date"
        value={correcting.typed.receivedOn ?? ""}
      />
    </CorrectionDialog>
  );
};

interface ArrivalRow extends Arrival {
  mayCorrect: boolean;
}

const DayCell = ({ value }: { value: Date }) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap">{formatDate(value, language)}</span>
  );
};

const ReceivedOnCell = ({ row }: { row: { original: ArrivalRow } }) => (
  <DayCell value={row.original.receivedOn} />
);

const ArrivalItemCell = ({ row }: { row: { original: ArrivalRow } }) => (
  <span className="font-medium">{row.original.nameBn}</span>
);

/** Bought or cut from the farm's own land, as a word with its colour. */
const KindBadge = ({ harvest }: { harvest: boolean }) => {
  const { t } = useLanguage();
  return (
    <StatusBadge tone={harvest ? "success" : "info"}>
      {harvest ? t("stock.harvest") : t("stock.purchase")}
    </StatusBadge>
  );
};

const KindCell = ({ row }: { row: { original: ArrivalRow } }) => (
  <KindBadge harvest={row.original.priceBdt === null} />
);

/** How much came in, and — for feed weighed in kg — the maunds a trader's slip says beneath it. */
const QuantityCell = ({ row }: { row: { original: ArrivalRow } }) => {
  const { t, language } = useLanguage();
  const one = row.original;
  return (
    <div className="flex flex-col items-end">
      <span className="whitespace-nowrap">
        {formatNumber(one.quantity, language)} {one.unit}
      </span>
      {one.maunds === null ? null : (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {t("stock.maunds", { maunds: formatNumber(one.maunds, language) })}
        </span>
      )}
    </div>
  );
};

const PriceCell = ({ row }: { row: { original: ArrivalRow } }) => {
  const { language } = useLanguage();
  return row.original.priceBdt === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span className="whitespace-nowrap">
      ৳{formatNumber(row.original.priceBdt, language)}
    </span>
  );
};

const SellerCell = ({ row }: { row: { original: ArrivalRow } }) =>
  row.original.sellerName ?? <span className="text-muted-foreground">—</span>;

/** What is left of this delivery in the store, the first to expire fed first; muted once it is all fed out. */
const LeftCell = ({ row }: { row: { original: ArrivalRow } }) => {
  const { language } = useLanguage();
  const left = row.original.left ?? row.original.quantity;
  return (
    <span className={left === 0 ? "text-muted-foreground" : "font-medium"}>
      {formatNumber(left, language)} {row.original.unit}
    </span>
  );
};

const LotCell = ({ row }: { row: { original: ArrivalRow } }) => (
  <LotAndExpiry
    expiresOn={row.original.expiresOn}
    lotNumber={row.original.lotNumber}
    standing={row.original.standing}
  />
);

const CorrectCell = ({ row }: { row: { original: ArrivalRow } }) =>
  row.original.mayCorrect ? <ArrivalCorrection arrival={row.original} /> : null;

const arrivalColumn = createListColumns<ArrivalRow>();
const arrivalColumns = arrivalColumn.columns([
  arrivalColumn.accessor((one) => new Date(one.receivedOn).getTime(), {
    id: "receivedOn",
    header: listHeader("stock.receivedOn"),
    cell: ReceivedOnCell,
  }),
  arrivalColumn.accessor("nameBn", {
    header: listHeader("stock.col.item"),
    cell: ArrivalItemCell,
  }),
  arrivalColumn.accessor((one) => (one.priceBdt === null ? 1 : 0), {
    id: "kind",
    header: listHeader("stock.kind"),
    cell: KindCell,
  }),
  arrivalColumn.accessor("quantity", {
    header: listHeader("stock.col.quantity"),
    cell: QuantityCell,
    meta: { align: "end" },
  }),
  arrivalColumn.accessor((one) => one.priceBdt ?? -1, {
    id: "price",
    header: listHeader("stock.price"),
    cell: PriceCell,
    meta: { align: "end" },
  }),
  arrivalColumn.accessor((one) => one.sellerName ?? "", {
    id: "seller",
    header: listHeader("stock.seller"),
    cell: SellerCell,
  }),
  arrivalColumn.accessor((one) => one.left ?? one.quantity, {
    id: "left",
    header: listHeader("lots.col.left"),
    cell: LeftCell,
    meta: { align: "end" },
  }),
  arrivalColumn.accessor((one) => one.expiresOn ?? "9999-12-31", {
    id: "lot",
    header: listHeader("lots.col.lot"),
    cell: LotCell,
  }),
  arrivalColumn.display({
    id: "correct",
    header: ActionsHeader,
    cell: CorrectCell,
    meta: { align: "end" },
  }),
]);

/** A lot on a phone: what and how much on top, when, what it cost and from whom beneath. */
const ArrivalCard = ({ row }: { row: ArrivalRow }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.nameBn}</span>
          <KindBadge harvest={row.priceBdt === null} />
        </div>
        <span className="font-semibold tabular-nums">
          {formatNumber(row.quantity, language)} {row.unit}
          {row.maunds === null ? null : (
            <span className="text-muted-foreground text-xs font-normal">
              {" "}
              ·{" "}
              {t("stock.maunds", {
                maunds: formatNumber(row.maunds, language),
              })}
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatDate(row.receivedOn, language)}
          {row.priceBdt === null
            ? ""
            : ` · ${taka(row.priceBdt)} · ${row.sellerName ?? ""}`}
        </span>
        <LotAndExpiry
          expiresOn={row.expiresOn}
          lotNumber={row.lotNumber}
          standing={row.standing}
        />
      </div>
      {row.mayCorrect ? <ArrivalCorrection arrival={row} /> : null}
    </div>
  );
};

const arrivalCard = (row: ArrivalRow) => <ArrivalCard row={row} />;

type KindFilter = "" | "purchase" | "harvest";

/** Every Feed Item a history names, once, for its filter. */
const ItemFilter = ({
  items,
  value,
  onChange,
}: {
  items: FeedItemRow[];
  value: string;
  onChange: (value: string) => void;
}) => {
  const { t } = useLanguage();
  return (
    <NativeSelect
      aria-label={t("stock.filterItem")}
      className="sm:w-56"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">{t("stock.allItems")}</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.nameBn}
        </option>
      ))}
    </NativeSelect>
  );
};

/** Feed that came into the store, newest first, filtered by Feed Item and by bought or grown, a page at a time. */
export const ArrivalsTab = ({
  arrivals,
  items,
  mayCorrect,
}: {
  arrivals: Arrival[];
  items: FeedItemRow[];
  mayCorrect: boolean;
}) => {
  const { t } = useLanguage();
  const [itemId, setItemId] = useState("");
  const [kind, setKind] = useState<KindFilter>("");
  const shown = arrivals.filter(
    (one) =>
      (itemId === "" || one.feedItemId === itemId) &&
      (kind === "" || (kind === "harvest") === (one.priceBdt === null))
  );
  const table = useListTable({
    columns: arrivalColumns,
    data: shown.map((one) => ({ ...one, mayCorrect })),
    getRowId: (row) => row.id,
  });
  if (arrivals.length === 0) {
    return <EmptyState icon={Truck} title={t("stock.noArrivals")} />;
  }
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      <FilterBar className="border-b pb-4 sm:justify-between">
        <ItemFilter items={items} onChange={setItemId} value={itemId} />
        <SegmentedControl
          label={t("stock.kind")}
          name="arrival-kind"
          onChange={setKind}
          options={[
            { value: "", label: t("audit.all") },
            { value: "purchase", label: t("stock.purchase") },
            { value: "harvest", label: t("stock.harvest") },
          ]}
          value={kind}
        />
      </FilterBar>
      {shown.length === 0 ? (
        <EmptyState bare icon={Truck} title={t("audit.empty")} />
      ) : (
        <DataTable
          card={arrivalCard}
          key={`${itemId}:${kind}`}
          minWidth="52rem"
          pageSize={HISTORY_PAGE}
          table={table}
        />
      )}
    </div>
  );
};

const CountedOnCell = ({ row }: { row: { original: Adjustment } }) => (
  <DayCell value={row.original.countedAt} />
);

const CountItemCell = ({ row }: { row: { original: Adjustment } }) => (
  <span className="font-medium">{row.original.nameBn}</span>
);

/** A figure from a Stock Count, in the reader's digits. */
const CountFigure = ({ value }: { value: number }) => {
  const { language } = useLanguage();
  return formatNumber(value, language);
};

const ExpectedCell = ({ row }: { row: { original: Adjustment } }) => (
  <CountFigure value={row.original.expected} />
);

const CountedCell = ({ row }: { row: { original: Adjustment } }) => (
  <CountFigure value={row.original.counted} />
);

/** The difference a count found, less in the danger colour and more in the success colour. */
const DifferenceCell = ({ row }: { row: { original: Adjustment } }) => {
  const { language } = useLanguage();
  const difference =
    Math.round((row.original.counted - row.original.expected) * 10) / 10;
  return (
    <span
      className={cn(
        "font-medium whitespace-nowrap tabular-nums",
        difference < 0 && "text-danger",
        difference > 0 && "text-success"
      )}
    >
      {difference > 0 ? "+" : ""}
      {formatNumber(difference, language)}
    </span>
  );
};

const countColumn = createListColumns<Adjustment>();
const countColumns = countColumn.columns([
  countColumn.accessor((one) => new Date(one.countedAt).getTime(), {
    id: "countedAt",
    header: listHeader("money.col.date"),
    cell: CountedOnCell,
  }),
  countColumn.accessor("nameBn", {
    header: listHeader("stock.col.item"),
    cell: CountItemCell,
  }),
  countColumn.accessor("expected", {
    header: listHeader("stock.col.expected"),
    cell: ExpectedCell,
    meta: { align: "end" },
  }),
  countColumn.accessor("counted", {
    header: listHeader("stock.col.counted"),
    cell: CountedCell,
    meta: { align: "end" },
  }),
  countColumn.accessor((one) => one.counted - one.expected, {
    id: "difference",
    header: listHeader("mismatch.col.difference"),
    cell: DifferenceCell,
    meta: { align: "end" },
  }),
  countColumn.accessor("reason", {
    header: listHeader("audit.reason"),
  }),
  countColumn.accessor((one) => one.countedByName ?? "—", {
    id: "countedBy",
    header: listHeader("stock.col.countedBy"),
  }),
]);

/** A count on a phone: the Feed Item and its difference on top, the figures and the reason beneath. */
const CountCard = ({ row }: { row: Adjustment }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{row.nameBn}</span>
        <DifferenceCell row={{ original: row }} />
      </div>
      <span className="text-muted-foreground text-xs">
        {formatDate(row.countedAt, language)} ·{" "}
        {t("stock.adjustment", {
          expected: formatNumber(row.expected, language),
          counted: formatNumber(row.counted, language),
        })}
        {row.countedByName ? ` · ${row.countedByName}` : ""}
      </span>
      <span className="text-sm">{row.reason}</span>
    </div>
  );
};

const countCard = (row: Adjustment) => <CountCard row={row} />;

/** What the Stock Counts found against what the store was thought to hold, a page at a time. */
export const CountsTab = ({
  adjustments,
  items,
}: {
  adjustments: Adjustment[];
  items: FeedItemRow[];
}) => {
  const { t } = useLanguage();
  const [itemId, setItemId] = useState("");
  const shown = adjustments.filter(
    (one) => itemId === "" || one.feedItemId === itemId
  );
  const table = useListTable({
    columns: countColumns,
    data: shown,
    getRowId: (row) => row.id,
  });
  if (adjustments.length === 0) {
    return <EmptyState icon={ClipboardList} title={t("stock.noCounts")} />;
  }
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      <FilterBar className="border-b pb-4 sm:justify-between">
        <ItemFilter items={items} onChange={setItemId} value={itemId} />
      </FilterBar>
      <DataTable
        card={countCard}
        key={itemId}
        minWidth="56rem"
        pageSize={HISTORY_PAGE}
        table={table}
      />
    </div>
  );
};

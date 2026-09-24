import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { ReceiptText, Truck } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { TagLink } from "@/components/fattening/fattening-words";
import { EmptyState } from "@/components/page";
import { RowMenu } from "@/components/page-kit";
import type { PaperId } from "@/components/paper";
import { Paper } from "@/components/paper";
import { SaleCorrection } from "@/components/sale-correction";
import { useSalePapers } from "@/components/sale/sale-papers";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

export type Sold = Awaited<ReturnType<typeof orpc.papers.day.call>>[number];

/** What can be done with one of the day's sales from this screen: its two papers, and — for the Manager or the
 *  Owner — a Correction. */
interface SalePapers {
  handleReceipt: (saleId: string) => void;
  handleCard: (saleId: string) => void;
  mayCorrect: boolean;
  busy: boolean;
}

/** A Correction as its own button, since it opens its own dialog, and the two papers in the menu beside it. */
const SaleActions = ({ sale, papers }: { sale: Sold; papers: SalePapers }) => {
  const { t } = useLanguage();
  const { handleReceipt, handleCard } = papers;
  return (
    <div className="flex items-center justify-end gap-1">
      {papers.mayCorrect ? <SaleCorrection sale={sale} /> : null}
      <RowMenu
        actions={[
          {
            label: t("sale.receipt"),
            icon: ReceiptText,
            handleSelect: () => handleReceipt(sale.id),
            disabled: papers.busy,
          },
          {
            label: t("sale.transportCard"),
            icon: Truck,
            handleSelect: () => handleCard(sale.id),
            disabled: papers.busy,
          },
        ]}
        label={t("sale.rowActions", { tag: sale.tagNumber })}
      />
    </div>
  );
};

interface SoldRow extends Sold {
  papers: SalePapers;
}

interface SoldCell {
  row: { original: SoldRow };
}

/** The hour a sale was made on the farm's clock: the day is today, so the time alone is said. */
const timeOf = (when: Date, language: "bn" | "en") =>
  formatDate(new Date(when), language, "time");

/** Taka, in the reader's digits. */
const Taka = ({ value }: { value: number }) => {
  const { t, language } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      {t("intake.taka", { taka: formatNumber(value, language) })}
    </span>
  );
};

const TimeCell = ({ row }: SoldCell) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap tabular-nums">
      {timeOf(row.original.soldAt, language)}
    </span>
  );
};

const TagCell = ({ row }: SoldCell) => (
  <TagLink tagNumber={row.original.tagNumber} />
);

const BuyerCell = ({ row }: SoldCell) => (
  <span className="font-medium">{row.original.buyerName}</span>
);

const WeightCell = ({ row }: SoldCell) => {
  const { t, language } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      {t("intake.kg", { kg: formatNumber(row.original.weightKg, language) })}
    </span>
  );
};

/** What she fetched, and what that came to a kilo beneath. */
const PriceCell = ({ row }: SoldCell) => {
  const { t, language } = useLanguage();
  const { priceBdt, weightKg } = row.original;
  return (
    <div className="flex flex-col items-end">
      <span className="font-medium">
        <Taka value={priceBdt} />
      </span>
      {weightKg > 0 ? (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {t("intake.perKg", {
            taka: formatNumber(Math.round(priceBdt / weightKg), language),
          })}
        </span>
      ) : null}
    </div>
  );
};

/** The lorry she went on, and where to. */
const LoadCell = ({ row }: SoldCell) => (
  <div className="flex flex-col">
    <span className="whitespace-nowrap">{row.original.vehicle}</span>
    <span className="text-muted-foreground text-xs">
      {row.original.destination}
    </span>
  </div>
);

const ActionsCell = ({ row }: SoldCell) => (
  <SaleActions papers={row.original.papers} sale={row.original} />
);

const column = createListColumns<SoldRow>();
const soldColumns = column.columns([
  column.accessor((row) => new Date(row.soldAt).getTime(), {
    id: "soldAt",
    header: listHeader("sale.col.time"),
    cell: TimeCell,
  }),
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor("buyerName", {
    header: listHeader("sale.soldTo"),
    cell: BuyerCell,
  }),
  column.accessor("weightKg", {
    header: listHeader("sale.weight"),
    cell: WeightCell,
    meta: { align: "end" },
  }),
  column.accessor("priceBdt", {
    header: listHeader("sale.price"),
    cell: PriceCell,
    meta: { align: "end" },
  }),
  column.accessor("vehicle", {
    header: listHeader("sale.groupTransport"),
    cell: LoadCell,
  }),
  column.display({
    id: "actions",
    header: ActionsHeader,
    cell: ActionsCell,
    meta: { align: "end" },
  }),
]);

/** A sale on a phone: which beast and when on top, what she fetched large, the buyer, her weight and the lorry
 *  beneath, and a Correction and the papers at the side. */
const SoldCard = ({ row }: { row: SoldRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <TagLink tagNumber={row.tagNumber} />
          <span className="text-muted-foreground text-xs tabular-nums">
            {timeOf(row.soldAt, language)}
          </span>
        </div>
        <span className="text-lg font-semibold tabular-nums">
          <Taka value={row.priceBdt} />
        </span>
        <span className="text-muted-foreground text-xs">
          {[
            row.buyerName,
            t("intake.kg", { kg: formatNumber(row.weightKg, language) }),
            row.vehicle,
          ].join(" · ")}
        </span>
      </div>
      <SaleActions papers={row.papers} sale={row} />
    </div>
  );
};

const soldCard = (row: SoldRow) => <SoldCard row={row} />;

/** The day's sales as rows, each with its papers. */
const SoldTable = ({ sold, papers }: { sold: Sold[]; papers: SalePapers }) => {
  const table = useListTable({
    columns: soldColumns,
    data: sold.map((row) => ({ ...row, papers })),
    getRowId: (row) => row.id,
  });
  return (
    <DataTable
      card={soldCard}
      className="no-print"
      minWidth="56rem"
      table={table}
    />
  );
};

/**
 * The day's sales, and the two papers each buyer leaves with.
 *
 * Asked for one at a time rather than printed with every sale: at Eid the receipt is written once
 * the man has finished buying, and it covers everything he took that morning. The paper asked for is drawn beneath
 * the list, ready to print.
 */
export const TodaysSales = ({
  sold,
  mayCorrect,
}: {
  sold: Sold[];
  mayCorrect: boolean;
}) => {
  const { t } = useLanguage();
  const [paper, setPaper] = useState<{ id: PaperId; text: string } | null>(
    null
  );
  const shown = (id: PaperId, text: string) => {
    setPaper({ id, text });
    requestAnimationFrame(() =>
      document
        .querySelector(`#${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };
  const { askReceipt, askCard, busy } = useSalePapers(shown);

  if (sold.length === 0) {
    return (
      <div className="surface p-4 md:p-5">
        <EmptyState bare icon={ReceiptText} title={t("sale.noneToday")} />
      </div>
    );
  }

  const papers: SalePapers = {
    handleReceipt: askReceipt,
    handleCard: askCard,
    mayCorrect,
    busy,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="surface flex flex-col gap-4 p-4 md:p-5">
        <p className="text-muted-foreground no-print border-b pb-4 text-sm">
          {t("sale.todayHint")}
        </p>
        <SoldTable papers={papers} sold={sold} />
      </div>
      {paper ? <Paper id={paper.id} text={paper.text} /> : null}
    </div>
  );
};

import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { LotAndExpiry } from "@/components/expiry";
import { Nothing, SaidDate } from "@/components/list-cells";
import { EmptyState, Loaded } from "@/components/page";
import { FilterBar, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

import type { DrugProduct, Purchase } from "./drug-types";
import { productName } from "./drug-types";

/** How many purchases a page shows before the next. */
const HISTORY_PAGE = 20;

/** What one dose of a purchase came to. */
const perDose = (one: Purchase) =>
  one.doses > 0 ? Math.round((one.priceBdt / one.doses) * 100) / 100 : null;

const BoughtOnCell = ({ row }: { row: { original: Purchase } }) => (
  <span className="whitespace-nowrap">
    <SaidDate at={row.original.purchasedOn} />
  </span>
);

const DosesCell = ({ row }: { row: { original: Purchase } }) => {
  const { language } = useLanguage();
  return formatNumber(row.original.doses, language);
};

const PriceCell = ({ row }: { row: { original: Purchase } }) => {
  const { language } = useLanguage();
  return (
    <span className="font-medium whitespace-nowrap">
      ৳{formatNumber(row.original.priceBdt, language)}
    </span>
  );
};

const PerDoseCell = ({ row }: { row: { original: Purchase } }) => {
  const { language } = useLanguage();
  const each = perDose(row.original);
  if (each === null) {
    return <Nothing />;
  }
  return (
    <span className="whitespace-nowrap">৳{formatNumber(each, language)}</span>
  );
};

/** Doses of this Lot still in the store, the first to expire given first; muted once it is all used. */
const LeftCell = ({ row }: { row: { original: Purchase } }) => {
  const { language } = useLanguage();
  const left = row.original.left ?? row.original.doses;
  return (
    <span className={left === 0 ? "text-muted-foreground" : "font-medium"}>
      {formatNumber(left, language)}
    </span>
  );
};

const LotCell = ({ row }: { row: { original: Purchase } }) => (
  <LotAndExpiry
    expiresOn={row.original.expiresOn}
    lotNumber={row.original.lotNumber}
    standing={row.original.standing}
  />
);

const column = createListColumns<Purchase>();
const purchaseColumns = column.columns([
  column.accessor((one) => new Date(one.purchasedOn).getTime(), {
    id: "purchasedOn",
    header: listHeader("drugs.boughtOn"),
    cell: BoughtOnCell,
  }),
  column.accessor("quantity", { header: listHeader("drugs.quantity") }),
  column.accessor("doses", {
    header: listHeader("drugs.doses"),
    cell: DosesCell,
    meta: { align: "end" },
  }),
  column.accessor("priceBdt", {
    header: listHeader("drugs.price"),
    cell: PriceCell,
    meta: { align: "end" },
  }),
  column.accessor((one) => perDose(one) ?? undefined, {
    id: "perDose",
    header: listHeader("drugs.col.perDose"),
    cell: PerDoseCell,
    meta: { align: "end" },
  }),
  column.accessor("sellerName", { header: listHeader("drugs.seller") }),
  column.accessor((one) => one.left ?? one.doses, {
    id: "left",
    header: listHeader("lots.col.left"),
    cell: LeftCell,
    meta: { align: "end" },
  }),
  // Sorted by the day it expires, soonest first, which is the order the store should be using it in.
  column.accessor((one) => one.expiresOn ?? undefined, {
    id: "lot",
    header: listHeader("lots.col.lot"),
    cell: LotCell,
  }),
]);

/** A purchase on a phone: the day and who sold it, what it cost large, how much and how many doses beneath. */
const PurchaseCard = ({ row }: { row: Purchase }) => {
  const { t, language } = useLanguage();
  const each = perDose(row);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{row.sellerName}</span>
        <span className="text-muted-foreground text-sm">
          {formatDate(row.purchasedOn, language)}
        </span>
      </div>
      <span className="text-lg font-semibold tabular-nums">
        ৳{formatNumber(row.priceBdt, language)}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {row.quantity} ·{" "}
        {t("drugs.dosesHeld", { doses: formatNumber(row.doses, language) })}
        {each === null
          ? ""
          : ` · ${t("drugs.perDose", { taka: formatNumber(each, language) })}`}
      </span>
      <LotAndExpiry
        expiresOn={row.expiresOn}
        lotNumber={row.lotNumber}
        standing={row.standing}
      />
    </div>
  );
};

const purchaseCard = (row: Purchase) => <PurchaseCard row={row} />;

/** What the list below adds up to: how many purchases, what they cost, and how many doses they held. */
const BoughtSummary = ({ purchases }: { purchases: Purchase[] }) => {
  const { t, language } = useLanguage();
  if (purchases.length === 0) {
    return null;
  }
  const taka = purchases.reduce((sum, one) => sum + one.priceBdt, 0);
  const doses = purchases.reduce((sum, one) => sum + one.doses, 0);
  return (
    <p className="text-muted-foreground text-sm tabular-nums">
      {t("drugs.boughtSummary", {
        count: formatNumber(purchases.length, language),
        taka: formatNumber(taka, language),
        doses: formatNumber(doses, language),
      })}
    </p>
  );
};

/** One product's purchases, as a table where there is room and cards on a phone. */
const PurchaseList = ({ purchases }: { purchases: Purchase[] }) => {
  const { t } = useLanguage();
  const table = useListTable({
    columns: purchaseColumns,
    data: purchases,
    getRowId: (row) => row.id,
  });
  if (purchases.length === 0) {
    return (
      <EmptyState bare icon={ShoppingCart} title={t("drugs.noneBought")} />
    );
  }
  return (
    <DataTable
      card={purchaseCard}
      minWidth="44rem"
      pageSize={HISTORY_PAGE}
      table={table}
    />
  );
};

/**
 * The medicine the farm has bought, a product at a time: chosen above, its purchases below, newest first, with what
 * they came to.
 */
export const PurchasesTab = ({
  products,
  productId,
  onProductChange,
}: {
  products: DrugProduct[];
  productId: string;
  onProductChange: (productId: string) => void;
}) => {
  const { t, language } = useLanguage();
  const chosen =
    products.find((product) => product.id === productId) ??
    products.find((product) => !product.retiredAt) ??
    products[0];
  const bought = useQuery({
    ...orpc.drugs.purchases.queryOptions({
      input: { drugProductId: chosen?.id ?? "" },
    }),
    enabled: chosen !== undefined,
  });
  if (!chosen) {
    return <EmptyState icon={ShoppingCart} title={t("drugs.none")} />;
  }
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      <FilterBar className="border-b pb-4 sm:justify-between">
        <NativeSelect
          aria-label={t("prescribe.product")}
          className="sm:w-72"
          onChange={(event) => onProductChange(event.target.value)}
          value={chosen.id}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.retiredAt
                ? `${productName(product, language)} · ${t("drugs.retired")}`
                : productName(product, language)}
            </option>
          ))}
        </NativeSelect>
        <BoughtSummary purchases={bought.data ?? []} />
      </FilterBar>
      <Loaded query={bought}>
        <PurchaseList key={chosen.id} purchases={bought.data ?? []} />
      </Loaded>
    </div>
  );
};

import { FEED_RATE_DAYS, feedUnitEach, feedUnitWord } from "@OpenFarm/domain";
import type { FeedEstimateBasis } from "@OpenFarm/domain/feed-estimate";
import { formatNumber } from "@OpenFarm/i18n";
import { Field, FieldGroup, FieldLabel } from "@OpenFarm/ui/components/field";
import { Input } from "@OpenFarm/ui/components/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@OpenFarm/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Coins, ShoppingCart } from "lucide-react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Nothing } from "@/components/list-cells";
import {
  EmptyState,
  Loaded,
  Notice,
  Section,
  TableSkeleton,
} from "@/components/page";
import { FigureTerm, SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney, useMoneyRate } from "@/lib/money";
import { isAMonth, saidMonth } from "@/lib/months";
import { namesIn } from "@/lib/names-in";
import { orpc } from "@/utils/orpc";

import { OtherName, TwoNames } from "./feed-name";

type Estimate = Awaited<ReturnType<typeof orpc.stock.monthlyEstimate.call>>;
type EstimateLine = Estimate["lines"][number];
const EMPTY_LINES: EstimateLine[] = [];

const Amount = ({ value, unit }: { value: number | null; unit: string }) => {
  const { language } = useLanguage();
  return value === null ? (
    <Nothing />
  ) : (
    <span className="whitespace-nowrap tabular-nums">
      {formatNumber(value, language)} {feedUnitWord(unit, language)}
    </span>
  );
};

const Money = ({ value }: { value: number | null }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  return value === null ? (
    <span className="text-muted-foreground text-xs">
      {t("feed.estimate.unpriced")}
    </span>
  ) : (
    <span className="whitespace-nowrap tabular-nums">{asMoney(value)}</span>
  );
};

const NameCell = ({ row }: { row: { original: EstimateLine } }) => {
  const { t } = useLanguage();
  const line = row.original;
  return (
    <div className="flex flex-col gap-1">
      <TwoNames className="font-medium" named={line} />
      {line.required === null ? (
        <span className="text-warning text-xs">
          {t(
            line.missingWeight
              ? "feed.estimate.missingWeight"
              : "feed.estimate.noRecent"
          )}
        </span>
      ) : null}
    </div>
  );
};
const DailyCell = ({ row }: { row: { original: EstimateLine } }) => (
  <Amount unit={row.original.unit} value={row.original.perDay} />
);
const RequiredCell = ({ row }: { row: { original: EstimateLine } }) => (
  <Amount unit={row.original.unit} value={row.original.required} />
);
const AvailableCell = ({ row }: { row: { original: EstimateLine } }) => (
  <Amount unit={row.original.unit} value={row.original.available} />
);
const ToBuyCell = ({ row }: { row: { original: EstimateLine } }) => (
  <span className={row.original.toBuy ? "text-warning font-medium" : undefined}>
    <Amount unit={row.original.unit} value={row.original.toBuy} />
  </span>
);
const Price = ({ line }: { line: EstimateLine }) => {
  const { t, language } = useLanguage();
  const asRate = useMoneyRate();
  return line.priceMoney === null ? (
    <span className="text-muted-foreground text-xs">
      {t("feed.estimate.unpriced")}
    </span>
  ) : (
    <span className="whitespace-nowrap tabular-nums">
      {asRate(line.priceMoney)} / {feedUnitEach(line.unit, language)}
    </span>
  );
};
const PriceCell = ({ row }: { row: { original: EstimateLine } }) => (
  <Price line={row.original} />
);
const CostCell = ({ row }: { row: { original: EstimateLine } }) =>
  row.original.toBuy === null ? (
    <Nothing />
  ) : (
    <Money value={row.original.toBuyMoney} />
  );

const column = createListColumns<EstimateLine>();
const estimateColumns = column.columns([
  column.accessor("nameBn", {
    header: listHeader("stock.col.item"),
    cell: NameCell,
  }),
  column.accessor((line) => line.perDay ?? undefined, {
    id: "daily",
    header: listHeader("feed.estimate.daily"),
    cell: DailyCell,
    meta: { align: "end" },
  }),
  column.accessor((line) => line.required ?? undefined, {
    id: "required",
    header: listHeader("feed.estimate.required"),
    cell: RequiredCell,
    meta: { align: "end" },
  }),
  column.accessor("available", {
    header: listHeader("feed.estimate.available"),
    cell: AvailableCell,
    meta: { align: "end" },
  }),
  column.accessor((line) => line.toBuy ?? undefined, {
    id: "toBuy",
    header: listHeader("feed.estimate.toBuy"),
    cell: ToBuyCell,
    meta: { align: "end" },
  }),
  column.accessor((line) => line.priceMoney ?? undefined, {
    id: "price",
    header: listHeader("feed.estimate.price"),
    cell: PriceCell,
    meta: { align: "end" },
  }),
  column.accessor((line) => line.toBuyMoney ?? undefined, {
    id: "cost",
    header: listHeader("feed.estimate.cost"),
    cell: CostCell,
    meta: { align: "end" },
  }),
]);

const EstimateCard = ({ line }: { line: EstimateLine }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{namesIn(line, language).shown}</span>
        <OtherName named={line} />
        {line.required === null ? (
          <span className="text-warning text-xs">
            {t(
              line.missingWeight
                ? "feed.estimate.missingWeight"
                : "feed.estimate.noRecent"
            )}
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <FigureTerm label={t("feed.estimate.required")}>
          <Amount unit={line.unit} value={line.required} />
        </FigureTerm>
        <FigureTerm label={t("feed.estimate.available")}>
          <Amount unit={line.unit} value={line.available} />
        </FigureTerm>
        <FigureTerm
          label={t("feed.estimate.toBuy")}
          tone={line.toBuy ? "warning" : "neutral"}
        >
          <Amount unit={line.unit} value={line.toBuy} />
        </FigureTerm>
        <FigureTerm label={t("feed.estimate.cost")}>
          {line.toBuy === null ? (
            <Nothing />
          ) : (
            <Money value={line.toBuyMoney} />
          )}
        </FigureTerm>
        <FigureTerm label={t("feed.estimate.daily")}>
          <Amount unit={line.unit} value={line.perDay} />
        </FigureTerm>
        <FigureTerm label={t("feed.estimate.price")}>
          <Price line={line} />
        </FigureTerm>
      </dl>
    </div>
  );
};
const estimateCard = (line: EstimateLine) => <EstimateCard line={line} />;

const EstimateSummary = ({ estimate }: { estimate: Estimate }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const partial =
    estimate.totals.unknownDemand > 0 ||
    estimate.totals.unpriced > 0 ||
    estimate.animalsWithoutRation > 0;
  return (
    <>
      <SummaryFigures
        hintsOnPhone
        figures={[
          {
            label: t("feed.estimate.month"),
            value: saidMonth(estimate.month, language),
            hint: t("feed.estimate.days", { days: estimate.days }),
            icon: CalendarDays,
          },
          {
            label: t("feed.estimate.budget"),
            value: asMoney(estimate.totals.requiredMoney),
            hint: t(
              partial ? "feed.estimate.partial" : "feed.estimate.budgetHint"
            ),
            icon: Coins,
          },
          {
            label: t("feed.estimate.cost"),
            value: asMoney(estimate.totals.toBuyMoney),
            hint: t(
              partial ? "feed.estimate.partial" : "feed.estimate.costHint"
            ),
            icon: ShoppingCart,
          },
          {
            label: t("feed.estimate.itemsToBuy"),
            value: formatNumber(estimate.totals.itemsToBuy, language),
            hint: t("feed.estimate.itemsHint"),
            icon: ShoppingCart,
          },
        ]}
      />
      {partial ? (
        <Notice tone="warning" title={t("feed.estimate.incomplete")}>
          {t("feed.estimate.missing", {
            demand: estimate.totals.unknownDemand,
            prices: estimate.totals.unpriced,
            animals: estimate.animalsWithoutRation,
          })}
        </Notice>
      ) : null}
      {estimate.estimatedWeights > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("feed.estimate.estimatedWeights", {
            count: estimate.estimatedWeights,
          })}
        </p>
      ) : null}
    </>
  );
};

export const MonthlyEstimateTab = ({
  month,
  basis,
  onMonth,
  onBasis,
}: {
  month: string;
  basis: FeedEstimateBasis;
  onMonth: (month: string) => void;
  onBasis: (basis: FeedEstimateBasis) => void;
}) => {
  const { t } = useLanguage();
  const estimate = useQuery(
    orpc.stock.monthlyEstimate.queryOptions({ input: { month, basis } })
  );
  const rows = estimate.data?.lines ?? EMPTY_LINES;
  const table = useListTable({
    columns: estimateColumns,
    data: rows,
    getRowId: (line) => line.feedItemId,
  });
  return (
    <Section
      id="monthly-feed-estimate"
      title={t("feed.estimate.title")}
      description={t("feed.estimate.description")}
    >
      <FieldGroup className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Field className="w-full sm:w-44">
          <FieldLabel htmlFor="feed-estimate-month">
            {t("feed.estimate.month")}
          </FieldLabel>
          <Input
            id="feed-estimate-month"
            type="month"
            value={month}
            onChange={(event) => {
              if (isAMonth(event.target.value)) {
                onMonth(event.target.value);
              }
            }}
          />
        </Field>
        <Field className="w-full sm:w-auto">
          <FieldLabel id="feed-estimate-basis-label">
            {t("feed.estimate.basis")}
          </FieldLabel>
          <ToggleGroup
            aria-labelledby="feed-estimate-basis-label"
            variant="outline"
            value={[basis]}
            onValueChange={(values) => {
              const [value] = values;
              if (value === "rations" || value === "recent") {
                onBasis(value);
              }
            }}
          >
            <ToggleGroupItem value="rations">
              {t("feed.estimate.rations")}
            </ToggleGroupItem>
            <ToggleGroupItem value="recent">
              {t("feed.estimate.recent")}
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </FieldGroup>
      <p className="text-muted-foreground text-sm">
        {t(
          basis === "rations"
            ? "feed.estimate.rationsHint"
            : "feed.estimate.recentHint",
          { days: FEED_RATE_DAYS }
        )}
      </p>
      <Loaded query={estimate} skeleton={<TableSkeleton />}>
        {estimate.data ? <EstimateSummary estimate={estimate.data} /> : null}
        {rows.length === 0 ? (
          <EmptyState
            bare
            icon={ShoppingCart}
            title={t("feed.estimate.none")}
          />
        ) : (
          <DataTable card={estimateCard} minWidth="64rem" table={table} />
        )}
        <p className="text-muted-foreground text-xs">
          {t("feed.estimate.stockHint")}
        </p>
      </Loaded>
    </Section>
  );
};

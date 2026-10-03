import { formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Beef } from "lucide-react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Nothing } from "@/components/list-cells";
import { EmptyState, Section } from "@/components/page";
import { Line } from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import { useKg } from "@/lib/kg";
import { useTaka, useTakaToThePaisa } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Costed = Awaited<
  ReturnType<typeof client.ventures.economics>
>["animals"][number];
type Weighed = Awaited<
  ReturnType<typeof client.ventures.herd>
>["animals"][number];

/** One of the Venture's animals as the table reads her: her costing, and her weighings where the herd has any. */
interface AnimalRow extends Costed {
  weighed: Weighed | undefined;
}

interface AnimalCell {
  row: { original: AnimalRow };
}

/** Where one of its animals is now: still hers, sold, or gone some other way — died or culled. */
const whereSheIs = (
  standing: boolean | undefined,
  saleMoney: number | null | undefined
) => {
  if (standing) {
    return "ventures.page.standing" as const;
  }
  return saleMoney === null || saleMoney === undefined
    ? ("ventures.page.gone" as const)
    : ("ventures.page.sold" as const);
};

/** Where she is, in the order the column sorts by: those still here, then the sold, then the dead and culled. */
const WHERE_ORDER = [
  "ventures.page.standing",
  "ventures.page.sold",
  "ventures.page.gone",
] as const;

const TagCell = ({ row }: AnimalCell) => (
  <Link
    className="font-mono font-semibold tabular-nums underline-offset-4 hover:underline focus-visible:underline"
    params={{ tagNumber: row.original.tagNumber }}
    to="/animals/$tagNumber"
  >
    {row.original.tagNumber}
  </Link>
);

const WhereCell = ({ row }: AnimalCell) => {
  const { t } = useLanguage();
  return (
    <>{t(whereSheIs(row.original.weighed?.standing, row.original.saleMoney))}</>
  );
};

/** What she weighed when she came, and now. */
const WeightSaid = ({ weighed }: { weighed: Weighed | undefined }) => {
  const weight = useKg();
  const kg = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : weight(value);
  return `${kg(weighed?.intakeKg)} → ${kg(weighed?.latestKg)}`;
};

const WeightCell = ({ row }: AnimalCell) => (
  <WeightSaid weighed={row.original.weighed} />
);

/** How fast she is gaining, or nothing until she has been weighed twice. */
const GainSaid = ({ weighed }: { weighed: Weighed | undefined }) => {
  const { t, language } = useLanguage();
  const gain = weighed?.dailyGainKg;
  if (gain === null || gain === undefined) {
    return <Nothing />;
  }
  return <>{t("units.kgADay", { kg: formatNumber(gain, language) })}</>;
};

const GainCell = ({ row }: AnimalCell) => (
  <GainSaid weighed={row.original.weighed} />
);

/** A sum in taka, or nothing where there is none yet. */
const Sum = ({ amount }: { amount: number | null }) => {
  const taka = useTaka();
  return amount === null ? <Nothing /> : <>{taka(amount)}</>;
};

const BoughtCell = ({ row }: AnimalCell) => (
  <Sum amount={row.original.purchaseMoney} />
);

const FetchedCell = ({ row }: AnimalCell) => (
  <Sum amount={row.original.saleMoney} />
);

/** What each kilogram she put on cost: the figure the run is judged by, per animal. */
const CostOfGainSaid = ({ amount }: { amount: number | null }) => {
  const rate = useTakaToThePaisa();
  return amount === null ? <Nothing /> : <>{rate(amount)}</>;
};

const CostOfGainCell = ({ row }: AnimalCell) => (
  <CostOfGainSaid amount={row.original.costOfGainMoney} />
);

/** What she made, in the loss's colour where she lost money. */
const MarginSaid = ({ amount }: { amount: number | null }) => {
  // Named, because the guard against untranslated JSX text reads an angle bracket in a comparison as a tag.
  const lostMoney = amount !== null && amount < 0;
  return (
    <span
      className={cn("font-medium tabular-nums", lostMoney && "text-danger")}
    >
      <Sum amount={amount} />
    </span>
  );
};

const MarginCell = ({ row }: AnimalCell) => (
  <MarginSaid amount={row.original.marginMoney} />
);

const column = createListColumns<AnimalRow>();
const animalColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("ventures.page.tag"),
    cell: TagCell,
  }),
  column.accessor(
    (row) =>
      WHERE_ORDER.indexOf(whereSheIs(row.weighed?.standing, row.saleMoney)),
    {
      id: "where",
      header: listHeader("ventures.page.whereSheIs"),
      cell: WhereCell,
    }
  ),
  column.accessor((row) => row.weighed?.latestKg ?? undefined, {
    id: "weight",
    header: listHeader("ventures.page.weight"),
    cell: WeightCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.weighed?.dailyGainKg ?? undefined, {
    id: "gain",
    header: listHeader("ventures.page.dailyGain"),
    cell: GainCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.purchaseMoney ?? undefined, {
    id: "bought",
    header: listHeader("ventures.page.bought"),
    cell: BoughtCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.saleMoney ?? undefined, {
    id: "fetched",
    header: listHeader("ventures.page.fetched"),
    cell: FetchedCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.costOfGainMoney ?? undefined, {
    id: "costOfGain",
    header: listHeader("ventures.herdCostOfGain"),
    cell: CostOfGainCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.marginMoney ?? undefined, {
    id: "margin",
    header: listHeader("ventures.page.margin"),
    cell: MarginCell,
    meta: { align: "end" },
  }),
]);

/** One animal on a phone: her tag and where she is, what she made at the right, and her figures under them. */
const AnimalCard = ({ row }: { row: AnimalRow }) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <TagCell row={{ original: row }} />
          <span className="text-muted-foreground text-sm">
            <WhereCell row={{ original: row }} />
          </span>
        </span>
        <MarginSaid amount={row.marginMoney} />
      </div>
      <div className="text-sm">
        <Line label={t("ventures.page.weight")}>
          <WeightSaid weighed={row.weighed} />
        </Line>
        <Line label={t("ventures.page.dailyGain")}>
          <GainSaid weighed={row.weighed} />
        </Line>
        <Line label={t("ventures.page.bought")}>
          <Sum amount={row.purchaseMoney} />
        </Line>
        <Line label={t("ventures.page.fetched")}>
          <Sum amount={row.saleMoney} />
        </Line>
        <Line label={t("ventures.herdCostOfGain")}>
          <CostOfGainSaid amount={row.costOfGainMoney} />
        </Line>
      </div>
    </div>
  );
};

const animalCard = (row: AnimalRow) => <AnimalCard row={row} />;

/** The animals as rows, in the order the costing sends them until a column is sorted. */
const AnimalsTable = ({ animals }: { animals: AnimalRow[] }) => {
  const table = useListTable({
    columns: animalColumns,
    data: animals,
    getRowId: (row) => row.tagNumber,
  });
  return <DataTable card={animalCard} minWidth="48rem" table={table} />;
};

/**
 * The animals this Venture's money bought: each one's weight when she came and now, how fast she is gaining,
 * what she cost, what she fetched and what she made — worst first once any are sold, because the question a
 * herd's figures answer is which one did not earn.
 *
 * Two answers joined by Tag Number: the herd's weighings, and each animal's costing.
 */
export const VentureAnimals = ({ venture }: { venture: Venture }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const rate = useTakaToThePaisa();
  const input = { input: { ventureId: venture.id } };
  const herd = useQuery(orpc.ventures.herd.queryOptions(input));
  const money = useQuery(orpc.ventures.economics.queryOptions(input));
  if (herd.isPending || money.isPending) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  const weights = new Map(
    (herd.data?.animals ?? []).map((one) => [one.tagNumber, one] as const)
  );
  const animals = money.data?.animals ?? [];
  if (animals.length === 0) {
    return (
      <Section>
        <EmptyState bare icon={Beef} title={t("ventures.noAnimalsYet")} />
      </Section>
    );
  }
  const orDash = (amount: number | null) =>
    amount === null ? "—" : taka(amount);
  return (
    <div className="flex flex-col gap-4">
      <Section>
        <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Line label={t("ventures.page.standing")}>
            {formatNumber(herd.data?.standingCount ?? 0, language)}
          </Line>
          <Line label={t("ventures.page.sold")}>
            {formatNumber(herd.data?.soldCount ?? 0, language)}
          </Line>
          <Line label={t("ventures.herdMargin")}>
            {orDash(money.data?.marginMoney ?? null)}
          </Line>
          <Line label={t("ventures.herdCostOfGain")}>
            {money.data?.costOfGainMoney === null ||
            money.data?.costOfGainMoney === undefined
              ? "—"
              : rate(money.data.costOfGainMoney)}
          </Line>
        </div>
      </Section>
      <Section>
        <AnimalsTable
          animals={animals.map((one) => ({
            ...one,
            weighed: weights.get(one.tagNumber),
          }))}
        />
      </Section>
    </div>
  );
};

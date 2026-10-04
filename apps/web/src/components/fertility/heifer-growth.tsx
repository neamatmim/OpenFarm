import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { TagLink } from "@/components/fattening/fattening-words";
import { Nothing } from "@/components/list-cells";
import { Section, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Heifer = Awaited<ReturnType<typeof client.breeding.heifers>>[number];

/** A month as the farm counts a heifer's age: thirty and a bit days. */
const DAYS_A_MONTH = 30.44;

const monthsOf = (days: number) => Math.round(days / DAYS_A_MONTH);

interface HeiferCell {
  row: { original: Heifer };
}

const HeiferTag = ({ row }: HeiferCell) => (
  <TagLink tagNumber={row.original.tagNumber} />
);

const AgeCell = ({ row }: HeiferCell) => {
  const { t, language } = useLanguage();
  const days = row.original.growth.ageDays;
  return days === null ? (
    <Nothing />
  ) : (
    <span className="whitespace-nowrap tabular-nums">
      {t("fertility.months", {
        months: formatNumber(monthsOf(days), language),
      })}
    </span>
  );
};

const WeightCell = ({ row }: HeiferCell) => {
  const { t, language } = useLanguage();
  const { latest } = row.original.growth;
  if (latest === null) {
    return (
      <span className="text-muted-foreground">{t("heifers.notWeighed")}</span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span className="tabular-nums">
        {t("units.kg", { kg: formatNumber(latest.weightKg, language) })}
      </span>
      <span className="text-muted-foreground text-xs">
        {formatDate(new Date(latest.weighedAt), language, "date")}
      </span>
    </span>
  );
};

const GainCell = ({ row }: HeiferCell) => {
  const { t, language } = useLanguage();
  const gain = row.original.growth.gainPerDay;
  return gain === null ? (
    <Nothing />
  ) : (
    <span className="whitespace-nowrap tabular-nums">
      {t("units.kgADay", { kg: formatNumber(gain, language) })}
    </span>
  );
};

/** Ready by weight, on track, or falling short — and what she will weigh at the age DLS has her served. */
const AtServiceCell = ({ row }: HeiferCell) => {
  const { t, language } = useLanguage();
  const { growth } = row.original;
  if (growth.reached) {
    return <StatusBadge tone="success">{t("heifers.reached")}</StatusBadge>;
  }
  if (growth.atServiceAgeKg === null) {
    return <Nothing />;
  }
  const said = t("heifers.atAge", {
    kg: t("units.kg", { kg: formatNumber(growth.atServiceAgeKg, language) }),
    months: t("fertility.months", {
      months: formatNumber(monthsOf(growth.aim.ageDays), language),
    }),
  });
  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <span className="tabular-nums">{said}</span>
      <StatusBadge tone={growth.behind ? "warning" : "neutral"}>
        {t(growth.behind ? "heifers.behind" : "heifers.onTrack")}
      </StatusBadge>
    </span>
  );
};

const column = createListColumns<Heifer>();
const heiferColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: HeiferTag,
  }),
  column.accessor((row) => row.growth.ageDays ?? undefined, {
    id: "age",
    header: listHeader("heifers.col.age"),
    cell: AgeCell,
    sortUndefined: "last",
  }),
  column.accessor((row) => row.growth.latest?.weightKg, {
    id: "weight",
    header: listHeader("heifers.col.weight"),
    cell: WeightCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.accessor((row) => row.growth.gainPerDay ?? undefined, {
    id: "gain",
    header: listHeader("heifers.col.gain"),
    cell: GainCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.accessor((row) => row.growth.atServiceAgeKg ?? undefined, {
    id: "atService",
    header: listHeader("heifers.col.atService"),
    cell: AtServiceCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
]);

/** A heifer on a phone: her tag and where she is heading, then her age, her last weight and her gain. */
const HeiferCard = ({ heifer }: { heifer: Heifer }) => {
  const row = { original: heifer };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <HeiferTag row={row} />
        <AtServiceCell row={row} />
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <AgeCell row={row} />
        <WeightCell row={row} />
        <GainCell row={row} />
      </div>
    </div>
  );
};

const heiferCard = (heifer: Heifer) => <HeiferCard heifer={heifer} />;

/**
 * Each heifer not yet in calf and how she is growing toward the weight DLS has her first served at (domain
 * `heifer-growth.ts`), those who will fall short first. Nothing on a farm with no heifers.
 */
export const HeiferGrowth = () => {
  const { t } = useLanguage();
  const heifers = useQuery(orpc.breeding.heifers.queryOptions());
  const table = useListTable({
    columns: heiferColumns,
    data: heifers.data ?? [],
    getRowId: (row) => row.tagNumber,
  });
  if (!heifers.data?.length) {
    return null;
  }
  return (
    <Section description={t("heifers.hint")} title={t("heifers.title")}>
      <DataTable
        card={heiferCard}
        minWidth="44rem"
        pageSize={20}
        table={table}
      />
    </Section>
  );
};

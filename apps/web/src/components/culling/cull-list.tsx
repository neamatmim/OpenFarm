import type { CullReason, MilkAgainstKeep } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { CalendarX, Milk, Repeat } from "lucide-react";
import { useState } from "react";

import { StateBadge } from "@/components/animal/animal-words";
import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { useIsOwner } from "@/components/fattening/animal-prices";
import { TagLink } from "@/components/fattening/fattening-words";
import { Nothing } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import { EmptyState, StatusBadge } from "@/components/page";
import { FilterBar, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka, useTakaToThePaisa } from "@/lib/taka";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

/**
 * The cows the farm names for the Owner to think about letting go, and why — her milk against her keep, empty long after
 * calving or dry and empty, or not settling — beside every other cow in milk or dry, so one that pays reads next to one
 * that does not. The Owner's alone; nothing here is answered or decided.
 */

export type CullList = Awaited<ReturnType<typeof client.culling.list>>;
type CullCow = CullList["cows"][number];

/** How many cows show before the next page. */
const CULL_PAGE = 20;

/** The Owner's list, asked only for the Owner. */
export const useCullList = () => {
  const owner = useIsOwner();
  return useQuery({ ...orpc.culling.list.queryOptions(), enabled: owner });
};

/** Each reason as it is drawn: its colour, its mark. */
const REASON_LOOK: Record<CullReason, { tone: Tone; icon: LucideIcon }> = {
  milk_short: { tone: "danger", icon: Milk },
  open_long: { tone: "warning", icon: CalendarX },
  repeat_breeder: { tone: "warning", icon: Repeat },
};

/** Why the farm cannot weigh her milk yet, in words. */
const UNKNOWN_WORD = {
  too_soon: "cull.tooSoon",
  not_fed: "cull.notFed",
  no_price: "cull.noPrice",
} as const;

/** Her reasons as badges, in the farm's one order; nothing where she has none. */
export const ReasonBadges = ({
  reasons,
}: {
  reasons: readonly CullReason[];
}) => {
  const { t } = useLanguage();
  if (reasons.length === 0) {
    return <Nothing />;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((reason) => (
        <StatusBadge
          icon={REASON_LOOK[reason].icon}
          key={reason}
          tone={REASON_LOOK[reason].tone}
        >
          {t(`cull.reason.${reason}`)}
        </StatusBadge>
      ))}
    </span>
  );
};

/**
 * Her milk against her keep over her last four weeks: what the two came to, what that leaves over her keep, and what a
 * litre of hers costs to make — or why it is not weighed yet, or that she is dry.
 */
const MilkLines = ({
  milk,
  state,
  align,
}: {
  milk: MilkAgainstKeep | null;
  state: string;
  align: "start" | "end";
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const perLitre = useTakaToThePaisa();
  const box = cn(
    "flex flex-col gap-0.5",
    align === "end" ? "items-end text-end" : "items-start"
  );
  if (milk === null) {
    return state === "dry" ? (
      <span className="text-muted-foreground text-xs">{t("cull.dry")}</span>
    ) : (
      <Nothing />
    );
  }
  if (!milk.known) {
    return (
      <span className="text-muted-foreground text-xs">
        {t(UNKNOWN_WORD[milk.because])}
      </span>
    );
  }
  const short = milk.overKeepBdt < 0;
  return (
    <span className={box}>
      <span className="text-sm whitespace-nowrap tabular-nums">
        {t("cull.milk", {
          worth: taka(milk.worthBdt),
          keep: taka(milk.keepBdt),
        })}
      </span>
      <span
        className={cn(
          "text-xs whitespace-nowrap tabular-nums",
          short ? "text-danger" : "text-success"
        )}
      >
        {t("cull.over", { over: taka(milk.overKeepBdt) })}
      </span>
      <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
        {milk.costPerLitreBdt === null
          ? t("cull.noneToBulk")
          : t("cull.rate", {
              litres: milk.litresPerDay,
              cost: perLitre(milk.costPerLitreBdt),
            })}
      </span>
      {milk.whole ? null : (
        <span className="text-muted-foreground text-xs">{t("keep.short")}</span>
      )}
    </span>
  );
};

/** Where she stands for her next calf: in calf and when, or how long empty since she last calved; and, for one that
 *  will not settle, the heats that did not take. */
const CalvingLines = ({ cow }: { cow: CullCow }) => {
  const { t, language } = useLanguage();
  const lines = [
    cow.inCalfDue
      ? t("cull.inCalf", {
          day: formatDate(new Date(cow.inCalfDue), language, "date"),
        })
      : t("cull.notInCalf"),
    cow.daysSinceCalving === null
      ? null
      : t("cull.sinceCalving", { days: cow.daysSinceCalving }),
    cow.failedAttempts === null
      ? null
      : t("repeatBreeder.failedAttempts", { count: cow.failedAttempts }),
  ].filter((line): line is string => line !== null);
  return (
    <span className="flex flex-col gap-0.5 text-xs">
      {lines.map((line, index) => (
        <span className={cn(index > 0 && "text-muted-foreground")} key={line}>
          {line}
        </span>
      ))}
    </span>
  );
};

interface CullCell {
  row: { original: CullCow };
}

const TagCell = ({ row }: CullCell) => (
  <TagLink tagNumber={row.original.tagNumber} />
);

const PenCell = ({ row }: CullCell) => (
  <div className="flex flex-col items-start gap-1">
    <span className="whitespace-nowrap">{row.original.penName}</span>
    <StateBadge state={row.original.state} />
  </div>
);

const ReasonsCell = ({ row }: CullCell) => (
  <ReasonBadges reasons={row.original.reasons} />
);

const MilkCell = ({ row }: CullCell) => (
  <MilkLines align="end" milk={row.original.milk} state={row.original.state} />
);

const CalvingCell = ({ row }: CullCell) => <CalvingLines cow={row.original} />;

const column = createListColumns<CullCow>();
const cullColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor("penName", {
    header: listHeader("animals.pen"),
    cell: PenCell,
  }),
  column.accessor((row) => row.reasons.length, {
    id: "reasons",
    header: listHeader("cull.col.reasons"),
    cell: ReasonsCell,
  }),
  column.accessor(
    (row) => (row.milk?.known ? row.milk.overKeepBdt : undefined),
    {
      id: "milk",
      header: listHeader("cull.col.milk"),
      cell: MilkCell,
      sortUndefined: "last",
      meta: { align: "end" },
    }
  ),
  column.accessor((row) => row.daysSinceCalving ?? undefined, {
    id: "calving",
    header: listHeader("cull.col.calving"),
    cell: CalvingCell,
    sortUndefined: "last",
  }),
]);

/** A cow on a phone: her tag and reasons on top, where she stands and her milk beneath. */
const CullCard = ({ cow }: { cow: CullCow }) => (
  <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <TagLink tagNumber={cow.tagNumber} />
      <StateBadge state={cow.state} />
      <span className="text-muted-foreground text-xs">{cow.penName}</span>
    </div>
    <ReasonBadges reasons={cow.reasons} />
    <MilkLines align="start" milk={cow.milk} state={cow.state} />
    <CalvingLines cow={cow} />
  </div>
);

const cullCard = (cow: CullCow) => <CullCard cow={cow} />;

/** The two lists the Owner reads: the named cows, or every cow with her figures. */
type Shown = "named" | "all";

/**
 * The cows as one list, the named ones first and the most reasons first among them: filtered to the named or every cow,
 * or found by her tag, a page at a time. A table where there is room; a card each on a phone.
 */
export const CullBoard = ({ cows }: { cows: CullCow[] }) => {
  const { t, language } = useLanguage();
  const [shown, setShown] = useState<Shown>("named");
  const [search, setSearch] = useState("");
  const wanted = search.trim().toUpperCase();
  const named = cows.filter((cow) => cow.reasons.length > 0);
  const rows = (shown === "named" ? named : cows)
    .filter(
      (cow) => wanted === "" || cow.tagNumber.toUpperCase().includes(wanted)
    )
    .toSorted(
      (a, b) =>
        b.reasons.length - a.reasons.length ||
        a.tagNumber.localeCompare(b.tagNumber)
    );
  const table = useListTable({
    columns: cullColumns,
    data: rows,
    getRowId: (row) => row.tagNumber,
  });
  const nobodyNamed = shown === "named" && named.length === 0;
  return (
    <div className="surface flex flex-col gap-4 p-4 md:p-5">
      <FilterBar className="border-b pb-4">
        <Input
          aria-label={t("animals.search")}
          autoComplete="off"
          className="sm:w-56"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("animals.searchPlaceholder")}
          type="search"
          value={search}
        />
        <NativeSelect
          aria-label={t("nav.culling")}
          className="sm:w-56"
          onChange={(event) =>
            setShown(event.target.value === "all" ? "all" : "named")
          }
          value={shown}
        >
          <option value="named">
            {`${t("cull.named")} · ${formatNumber(named.length, language)}`}
          </option>
          <option value="all">
            {`${t("cull.all")} · ${formatNumber(cows.length, language)}`}
          </option>
        </NativeSelect>
      </FilterBar>
      {nobodyNamed ? (
        <EmptyState
          bare
          description={t("cull.noneHint")}
          title={t("cull.none")}
        />
      ) : null}
      {!nobodyNamed && rows.length === 0 ? (
        <EmptyState bare title={t("cull.noneInFilter")} />
      ) : null}
      {rows.length > 0 ? (
        <DataTable
          card={cullCard}
          key={`${shown}:${wanted}`}
          minWidth="52rem"
          pageSize={CULL_PAGE}
          table={table}
        />
      ) : null}
    </div>
  );
};

/** Her reasons and her milk against her keep on her own page, for the Owner; nothing for anybody else, and nothing for
 *  a cow the list does not hold. */
export const HerCull = ({ tagNumber }: { tagNumber: string }) => {
  const { t } = useLanguage();
  const list = useCullList();
  const cow = list.data?.cows.find((one) => one.tagNumber === tagNumber);
  if (!cow) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 pt-4">
      <h3 className="font-semibold">{t("nav.culling")}</h3>
      <ReasonBadges reasons={cow.reasons} />
      <MilkLines align="start" milk={cow.milk} state={cow.state} />
      <CalvingLines cow={cow} />
      <p className="text-muted-foreground text-xs">{t("cull.hint")}</p>
    </div>
  );
};

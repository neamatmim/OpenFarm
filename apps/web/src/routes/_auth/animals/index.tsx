import { LIVE_STATES, SIDES, ageOf } from "@OpenFarm/domain";
import type { LiveState } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Beef,
  FilterX,
  Lock,
  Milk,
  Search,
  SlidersHorizontal,
  Tractor,
} from "lucide-react";
import { useState } from "react";

import { stillHeld } from "@/components/animal/animal-words";
import type { HerdRow } from "@/components/animal/herd-list";
import { HerdTable } from "@/components/animal/herd-list";
import {
  EmptyState,
  Page,
  PageHeader,
  SegmentedControl,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { FilterBar, NativeSelect, SummaryFigures } from "@/components/page-kit";
import { RegisterAnimal } from "@/components/register-animal";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** The filters' box, which a phone's filter button opens. */
const FILTERS_ID = "herd-filters";

type SideFilter = "" | (typeof SIDES)[number];
const HOLDS = ["milk", "meat", "any"] as const;
type HoldFilter = "" | (typeof HOLDS)[number];

/** What the herd is narrowed to, as the address keeps it. */
interface HerdSearch {
  q?: string;
  side?: SideFilter;
  state?: LiveState;
  pen?: string;
  held?: HoldFilter;
}

type Animal = Awaited<ReturnType<typeof orpc.animals.list.call>>[number];

/** Whether she passes the hold asked for: milk held, meat held, or held at all. */
const passesHold = (row: HerdRow, held: HoldFilter): boolean => {
  if (held === "milk") {
    return row.milkHeld;
  }
  if (held === "meat") {
    return row.meatHeld;
  }
  if (held === "any") {
    return row.milkHeld || row.meatHeld;
  }
  return true;
};

/** The four figures the herd is read by: how many there are, how they split between the Sides, and how many a
 *  Withdrawal holds back from the tank or from sale. */
const useHerdFigures = (rows: HerdRow[]): Figure[] => {
  const { t, language } = useLanguage();
  const count = (keep: (row: HerdRow) => boolean) => rows.filter(keep).length;
  const milkHeld = count((row) => row.milkHeld);
  const meatHeld = count((row) => row.meatHeld);
  return [
    {
      label: t("animals.kpi.herd"),
      value: formatNumber(rows.length, language),
      hint: t("animals.kpi.herdHint"),
      icon: Tractor,
    },
    {
      label: t("animals.kpi.sides"),
      value: `${formatNumber(
        count((row) => row.side === "dairy"),
        language
      )} · ${formatNumber(
        count((row) => row.side === "fattening"),
        language
      )}`,
      icon: Beef,
    },
    {
      label: t("animals.milkHeld"),
      value: formatNumber(milkHeld, language),
      hint: t("animals.kpi.milkHeldHint"),
      icon: Milk,
      tone: milkHeld > 0 ? "warning" : "neutral",
    },
    {
      label: t("animals.meatHeld"),
      value: formatNumber(meatHeld, language),
      hint: t("animals.kpi.meatHeldHint"),
      icon: Lock,
      tone: meatHeld > 0 ? "warning" : "neutral",
    },
  ];
};

/** The herd's rows, each with her Pen's name — none for a visiting Vet, who reaches their Cases and not the sheds. */
const useHerdRows = (animals: Animal[]): HerdRow[] => {
  const me = useQuery(orpc.people.me.queryOptions());
  const onlyCases =
    me.data?.roles.length === 1 && me.data.scopes?.vet?.kind === "cases";
  const sheds = useQuery({
    ...orpc.herd.list.queryOptions(),
    enabled: Boolean(me.data) && !onlyCases,
  });
  const penNames = new Map(
    (sheds.data ?? []).flatMap((shed) =>
      shed.pens.map((pen) => [pen.id, `${shed.name} / ${pen.name}`] as const)
    )
  );
  const now = new Date();
  return animals.map((a) => ({
    id: a.id,
    tagNumber: a.tagNumber,
    officialTag: a.officialTag,
    penId: a.penId,
    state: a.state,
    side: a.side,
    penName: (a.penId && penNames.get(a.penId)) || "—",
    breed: a.breed,
    // A list this phone kept from before the farm sent the seller's word has none, until it is read again.
    age: ageOf(
      { birthDate: a.birthDate, ageAtIntake: a.ageAtIntake ?? null },
      now
    ),
    photoUpdatedAt: a.photoUpdatedAt,
    milkHeld: stillHeld(a.milkWithdrawalUntil),
    meatHeld: stillHeld(a.meatWithdrawalUntil),
  }));
};

/** The rows the filters leave: a Tag Number or official tag as typed, then Side, State, Pen and hold. */
const narrowed = (rows: HerdRow[], search: HerdSearch, needle: string) =>
  rows.filter(
    (row) =>
      (needle === "" ||
        row.tagNumber.toUpperCase().includes(needle) ||
        (row.officialTag ?? "").toUpperCase().includes(needle)) &&
      (!search.side || row.side === search.side) &&
      (!search.state || row.state === search.state) &&
      (!search.pen || row.penId === search.pen) &&
      passesHold(row, search.held ?? "")
  );

/** The filters over the herd: her Side, her State, whatever holds her, and — where the herd stands in more than one —
 *  her Pen. Only the Pens her herd stands in are offered: a Staff member's own, the farm's for those who run it. */
const HerdFilters = ({
  search,
  rows,
  open,
  onSearch,
}: {
  search: HerdSearch;
  rows: HerdRow[];
  /** Whether a phone has opened them: there the list, not the filters, fills the first screen. */
  open: boolean;
  onSearch: (next: HerdSearch) => void;
}) => {
  const { t } = useLanguage();
  const { side = "", state = "", pen = "", held = "" } = search;
  const setSearch = onSearch;
  const sides: { value: SideFilter; label: string }[] = [
    { value: "", label: t("audit.all") },
    ...SIDES.map((value) => ({ value, label: t(`animals.side.${value}`) })),
  ];
  // Only the Pens her herd stands in: a Staff member's own, the farm's for those who run it.
  const pens = [
    ...new Map(
      rows
        .filter((row) => row.penId)
        .map((row) => [row.penId, row.penName] as const)
    ),
  ].toSorted(([, a], [, b]) => a.localeCompare(b));

  return (
    <div className={cn(!open && "hidden md:block")} id={FILTERS_ID}>
      <FilterBar>
        <SegmentedControl
          label={t("animals.side")}
          name="side"
          onChange={(value) => setSearch({ side: value })}
          options={sides}
          value={side}
        />
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <NativeSelect
            aria-label={t("animals.state")}
            className="sm:w-44"
            onChange={(event) =>
              setSearch({ state: event.target.value as LiveState })
            }
            value={state}
          >
            <option value="">{t("animals.filter.allStates")}</option>
            {LIVE_STATES.map((one) => (
              <option key={one} value={one}>
                {t(`state.${one}`)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t("animals.col.held")}
            className="sm:w-44"
            onChange={(event) =>
              setSearch({ held: event.target.value as HoldFilter })
            }
            value={held}
          >
            <option value="">{t("animals.filter.anyHold")}</option>
            <option value="any">{t("animals.filter.held")}</option>
            <option value="milk">{t("animals.milkHeld")}</option>
            <option value="meat">{t("animals.meatHeld")}</option>
          </NativeSelect>
          {pens.length > 1 ? (
            <NativeSelect
              aria-label={t("animals.pen")}
              className="col-span-2 sm:w-60"
              onChange={(event) => setSearch({ pen: event.target.value })}
              value={pen}
            >
              <option value="">{t("animals.filter.allPens")}</option>
              {pens.map(([id, name]) => (
                <option key={id} value={id ?? ""}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          ) : null}
        </div>
      </FilterBar>
    </div>
  );
};

/**
 * The herd this person works, by what somebody came to it for: how the herd stands, then any animal found by her Tag
 * Number as it is typed, or narrowed to a Side, a State, a Pen or a hold — all kept in the address, so the list comes
 * back as it was. A table where there is room; cards on a phone.
 */
const AnimalsPage = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const { q = "", side, state, pen, held } = search;
  const me = useQuery(orpc.people.me.queryOptions());
  const animals = useQuery(
    orpc.animals.list.queryOptions({ input: { includeExited: false } })
  );
  const rows = useHerdRows(animals.data ?? []);
  const figures = useHerdFigures(rows);
  const needle = q.trim().toUpperCase();
  const matching = narrowed(rows, search, needle);
  const narrowing = [side, state, pen, held].filter(Boolean).length;
  const filtered = Boolean(needle) || narrowing > 0;
  const [filtersOpen, setFiltersOpen] = useState(false);
  // A typed number that matches nobody is said as that; a filter that leaves nobody, as an empty group.
  let emptyWords = t("animals.noneHint");
  if (needle) {
    emptyWords = t("animals.noMatch");
  } else if (filtered) {
    emptyWords = t("gain.noneInFilter");
  }

  const setSearch = (next: HerdSearch) =>
    navigate({
      replace: true,
      search: (prev) => {
        const merged = { ...prev, ...next };
        return Object.fromEntries(
          Object.entries(merged).filter(([, value]) => Boolean(value))
        );
      },
    });
  const runsTheFarm = (me.data?.roles ?? []).some(
    (role) => role === "owner" || role === "manager"
  );
  return (
    <Page>
      <PageHeader
        actions={runsTheFarm ? <RegisterAnimal /> : null}
        description={t("animals.subtitle")}
        title={t("animals.title")}
      />

      {animals.data ? <SummaryFigures figures={figures} /> : null}

      <section className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            // One animal left, or a whole Tag Number typed: straight to her record.
            const exact =
              matching.length === 1 ? matching[0]?.tagNumber : needle;
            if (exact) {
              navigate({
                to: "/animals/$tagNumber",
                params: { tagNumber: exact },
              });
            }
          }}
        >
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              aria-label={t("animals.search")}
              autoComplete="off"
              className="pl-9 font-mono"
              onChange={(e) => setSearch({ q: e.target.value })}
              placeholder={t("animals.searchPlaceholder")}
              type="search"
              value={q}
            />
          </div>
          <Button type="submit">{t("animals.find")}</Button>
          <Button
            aria-controls={FILTERS_ID}
            aria-expanded={filtersOpen}
            aria-label={t("animals.filter.open")}
            className="relative md:hidden"
            onClick={() => setFiltersOpen((was) => !was)}
            size="icon"
            type="button"
            variant={filtersOpen ? "secondary" : "outline"}
          >
            <SlidersHorizontal aria-hidden />
            {narrowing > 0 ? (
              <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full text-xs font-semibold tabular-nums">
                {formatNumber(narrowing, language)}
              </span>
            ) : null}
          </Button>
        </form>

        <HerdFilters
          onSearch={setSearch}
          open={filtersOpen}
          rows={rows}
          search={search}
        />

        {animals.data ? (
          <div className="flex min-h-9 items-center justify-between gap-3 border-t pt-3">
            <p
              aria-live="polite"
              className="text-muted-foreground text-sm tabular-nums"
            >
              {t("animals.count", {
                count: formatNumber(matching.length, language),
              })}
            </p>
            {filtered ? (
              <Button
                onClick={() => navigate({ replace: true, search: {} })}
                size="sm"
                type="button"
                variant="ghost"
              >
                <FilterX aria-hidden data-icon="inline-start" />
                {t("animals.filter.clear")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {animals.isPending && !animals.data ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 8 }, (_, n) => (
              <Skeleton className="h-12 rounded-lg" key={n} />
            ))}
          </div>
        ) : null}

        {matching.length ? <HerdTable rows={matching} /> : null}

        {animals.data && matching.length === 0 ? (
          <EmptyState
            bare
            description={emptyWords}
            icon={Tractor}
            title={t("animals.none")}
          />
        ) : null}
      </section>
    </Page>
  );
};

const oneOf = <T extends string>(
  choices: readonly T[],
  value: unknown
): T | undefined => (choices.includes(value as T) ? (value as T) : undefined);

export const Route = createFileRoute("/_auth/animals/")({
  component: AnimalsPage,
  /** What was typed, and which Side, State, Pen and hold, kept in the address so the list is as it was on return. */
  validateSearch: (search: Record<string, unknown>): HerdSearch => {
    const kept: HerdSearch = {
      q: typeof search.q === "string" && search.q ? search.q : undefined,
      side: oneOf(SIDES, search.side),
      state: oneOf(LIVE_STATES, search.state),
      pen:
        typeof search.pen === "string" && search.pen ? search.pen : undefined,
      held: oneOf(HOLDS, search.held),
    };
    return Object.fromEntries(
      Object.entries(kept).filter(([, value]) => value !== undefined)
    ) as HerdSearch;
  },
});

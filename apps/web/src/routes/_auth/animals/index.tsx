import { SIDES } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Beef, Milk, Search, Tractor } from "lucide-react";
import { useState } from "react";

import { AnimalPhoto } from "@/components/animal-photo";
import {
  EmptyState,
  Page,
  PageHeader,
  SegmentedControl,
  StatusBadge,
} from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** How many animals a page of the herd shows before "show more": enough for a pen at a glance, few enough that a
 *  herd of five hundred does not fetch five hundred photographs at once. */
const PAGE = 60;

type SideFilter = "" | (typeof SIDES)[number];

/** Whether a Withdrawal still holds her, as of when the card is drawn. */
const stillHeld = (until: Date | string | null): boolean =>
  until !== null && new Date(until).getTime() > Date.now();

/** The herd this person works: found by Tag Number as it is typed, narrowed to a Side — both kept in the address,
 *  so the list comes back as it was — each animal known first by her number, then her State, and anything holding
 *  her back said on her card. */
const AnimalsPage = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q = "", side = "" } = Route.useSearch();
  const [shownCount, setShownCount] = useState(PAGE);
  const animals = useQuery(
    orpc.animals.list.queryOptions({
      input: {
        side: side === "" ? undefined : side,
        includeExited: false,
      },
    })
  );
  const needle = q.trim().toUpperCase();
  const matching = (animals.data ?? []).filter(
    (a) =>
      needle === "" ||
      a.tagNumber.toUpperCase().includes(needle) ||
      (a.officialTag ?? "").toUpperCase().includes(needle)
  );
  const shown = matching.slice(0, shownCount);
  const sides: { value: SideFilter; label: string }[] = [
    { value: "", label: t("audit.all") },
    ...SIDES.map((value) => ({ value, label: t(`animals.side.${value}`) })),
  ];
  const setSearch = (next: { q?: string; side?: SideFilter }) =>
    navigate({
      replace: true,
      search: (prev) => {
        const merged = { ...prev, ...next };
        return {
          ...(merged.q ? { q: merged.q } : {}),
          ...(merged.side ? { side: merged.side } : {}),
        };
      },
    });

  return (
    <Page>
      <PageHeader
        description={t("animals.subtitle")}
        meta={
          animals.data ? (
            <StatusBadge tone="neutral">
              {t("animals.count", {
                count: formatNumber(matching.length, language),
              })}
            </StatusBadge>
          ) : null
        }
        title={t("animals.title")}
      />

      <form
        className="bg-card flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          // One animal left, or a whole Tag Number typed: straight to her record.
          const exact = matching.length === 1 ? matching[0]?.tagNumber : needle;
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
            onChange={(e) => {
              setShownCount(PAGE);
              setSearch({ q: e.target.value });
            }}
            placeholder={t("animals.searchPlaceholder")}
            type="search"
            value={q}
          />
        </div>
        <SegmentedControl
          label={t("animals.side")}
          name="side"
          onChange={(value) => {
            setShownCount(PAGE);
            setSearch({ side: value });
          }}
          options={sides}
          value={side}
        />
        <Button type="submit">{t("animals.find")}</Button>
      </form>

      {animals.isPending && !animals.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, n) => (
            <Skeleton className="h-32 rounded-xl" key={n} />
          ))}
        </div>
      ) : null}

      {shown.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((a) => {
            const milkHeld = stillHeld(a.milkWithdrawalUntil);
            const meatHeld = stillHeld(a.meatWithdrawalUntil);
            const SideIcon = a.side === "dairy" ? Milk : Beef;
            return (
              <li key={a.id}>
                <Link
                  className="group bg-card hover:border-primary/40 focus-visible:ring-ring flex h-full items-start gap-3 rounded-xl border p-3 transition-[border-color,box-shadow] duration-150 outline-none hover:shadow-md focus-visible:ring-2"
                  params={{ tagNumber: a.tagNumber }}
                  to="/animals/$tagNumber"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-mono text-lg font-bold tabular-nums">
                      {a.tagNumber}
                    </span>
                    <span className="text-sm font-medium">
                      {t(`state.${a.state}`)}
                    </span>
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                      <SideIcon aria-hidden className="size-3.5" />
                      {t(`animals.side.${a.side}`)}
                    </span>
                    {milkHeld || meatHeld ? (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {milkHeld ? (
                          <StatusBadge tone="warning">
                            {t("animals.milkHeld")}
                          </StatusBadge>
                        ) : null}
                        {meatHeld ? (
                          <StatusBadge tone="warning">
                            {t("animals.meatHeld")}
                          </StatusBadge>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {a.photoUpdatedAt ? (
                    <AnimalPhoto
                      photoUpdatedAt={a.photoUpdatedAt}
                      size={56}
                      tagNumber={a.tagNumber}
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {shown.length < matching.length ? (
        <Button
          className="self-center"
          onClick={() => setShownCount((count) => count + PAGE)}
          variant="outline"
        >
          {t("animals.showMore", {
            shown: formatNumber(shown.length, language),
            total: formatNumber(matching.length, language),
          })}
        </Button>
      ) : null}

      {animals.data && matching.length === 0 ? (
        <EmptyState
          description={needle ? t("animals.noMatch") : t("animals.noneHint")}
          icon={Tractor}
          title={t("animals.none")}
        />
      ) : null}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/animals/")({
  component: AnimalsPage,
  /** What was typed and which Side, kept in the address so the list is as it was on return. */
  validateSearch: (
    search: Record<string, unknown>
  ): { q?: string; side?: SideFilter } => ({
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(search.side === "dairy" || search.side === "fattening"
      ? { side: search.side }
      : {}),
  }),
});

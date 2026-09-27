import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Sprout } from "lucide-react";

import { EmptyState, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

export type ReturnsPage = Awaited<ReturnType<typeof client.returns.page>>;
type Season = ReturnsPage["seasons"][number];
type Venture = ReturnsPage["ventures"][number];
type Returned = NonNullable<Season["returnOnCost"]>;

/** What the money in the farm's cattle returned: the Owner's alone. */
export const useReturns = () => useQuery(orpc.returns.page.queryOptions());

/** A share to one place, in the reader's digits, never signed: the words say gain or loss. */
const useShare = () => {
  const { language } = useLanguage();
  return (n: number) =>
    formatNumber(Math.abs(n), language, { maximumFractionDigits: 1 });
};

/** What a Season is called: its Eid's year, or its window's dates. */
const useSeasonName = () => {
  const { t, language } = useLanguage();
  return (season: Pick<Season, "eid" | "window">) =>
    season.eid === null
      ? t("returns.windowSeason", {
          start: formatDate(startOfFarmDay(season.window.start), language),
          end: formatDate(startOfFarmDay(season.window.end), language),
        })
      : t("returns.eidSeason", {
          year: formatNumber(Number(season.eid.slice(0, 4)), language, {
            useGrouping: false,
          }),
        });
};

/** The share first, then the days its money was out, then that share scaled to a year — never the year alone. */
const ReturnLines = ({
  returned,
  floorDays,
  on,
}: {
  returned: Returned;
  floorDays: number;
  on: "cost" | "capital";
}) => {
  const { t, language } = useLanguage();
  const share = useShare();
  const days = formatNumber(returned.averageDays, language);
  const gain = returned.per100 >= 0;
  const said =
    on === "cost"
      ? t(gain ? "returns.onCostGain" : "returns.onCostLoss", {
          amount: share(returned.per100),
        })
      : t(gain ? "returns.onCapitalGain" : "returns.onCapitalLoss", {
          amount: share(returned.per100),
        });
  const year = (() => {
    // A finished run with no rate a year was out fewer days than the floor: nothing else leaves it without one.
    if (returned.perYear === null) {
      return t("returns.underFloor", {
        floor: formatNumber(floorDays, language),
      });
    }
    return t(
      returned.perYear >= 0 ? "returns.perYearGain" : "returns.perYearLoss",
      { rate: share(returned.perYear) }
    );
  })();
  return (
    <div className="flex flex-col gap-0.5">
      <p
        className={cn("font-medium tabular-nums", !gain && "text-destructive")}
      >
        {said}
      </p>
      <p className="text-muted-foreground text-sm tabular-nums">
        {t("returns.days", { days })}
        {year ? ` · ${year}` : ""}
      </p>
    </div>
  );
};

/** How a rate a year was reached, opened under it. */
const Working = ({ returned }: { returned: Returned }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const share = useShare();
  const days = formatNumber(returned.averageDays, language);
  return (
    <details className="text-muted-foreground text-sm">
      <summary className="cursor-pointer underline-offset-4 select-none hover:underline">
        {t("returns.working")}
      </summary>
      <p className="mt-1 max-w-prose">
        {t("returns.workingText", {
          cost: taka(returned.costBdt),
          back: taka(returned.backBdt),
          days,
        })}{" "}
        {returned.perYear === null
          ? null
          : t("returns.workingYear", {
              share: share(returned.per100),
              days,
              rate: share(returned.perYear),
            })}
      </p>
    </details>
  );
};

/** The result in taka, said as made or lost. */
const Result = ({ bdt }: { bdt: number }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <span className={cn("tabular-nums", bdt < 0 && "text-destructive")}>
      {t(bdt < 0 ? "returns.lost" : "returns.made", {
        bdt: taka(Math.abs(bdt)),
      })}
    </span>
  );
};

/** One finished run, closed to its name and result, opening into how it was worked. */
const Row = ({
  kind,
  name,
  head,
  died,
  returned,
  floorDays,
  children,
}: {
  kind: string;
  name: React.ReactNode;
  head: number;
  died: number;
  returned: Returned;
  floorDays: number;
  children?: React.ReactNode;
}) => {
  const { t } = useLanguage();
  return (
    <li>
      <details className="group bg-card rounded-lg border">
        <summary className="flex cursor-pointer list-none flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <span className="flex flex-wrap items-center gap-2">
            <ChevronDown
              aria-hidden
              className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
            />
            <span className="font-medium">{name}</span>
            <StatusBadge tone="neutral">{kind}</StatusBadge>
            <span className="text-muted-foreground text-sm">
              {t("returns.head", { count: head })}
              {died > 0 ? ` · ${t("returns.died", { count: died })}` : ""}
            </span>
          </span>
          <Result bdt={returned.resultBdt} />
        </summary>
        <div className="flex flex-col gap-3 border-t p-4">
          <ReturnLines floorDays={floorDays} on="cost" returned={returned} />
          <Working returned={returned} />
          {children}
        </div>
      </details>
    </li>
  );
};

const SeasonRow = ({
  season,
  floorDays,
}: {
  season: Season;
  floorDays: number;
}) => {
  const { t } = useLanguage();
  const named = useSeasonName();
  if (!season.returnOnCost) {
    return null;
  }
  return (
    <Row
      died={season.died}
      floorDays={floorDays}
      head={season.head}
      kind={t("returns.season")}
      name={named(season)}
      returned={season.returnOnCost}
    />
  );
};

const VentureRow = ({
  venture,
  floorDays,
}: {
  venture: Venture;
  floorDays: number;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  if (!venture.returnOnCost) {
    return null;
  }
  return (
    <Row
      died={venture.died}
      floorDays={floorDays}
      head={venture.head}
      kind={t("returns.venture")}
      name={venture.name}
      returned={venture.returnOnCost}
    >
      {venture.returnOnCapital ? (
        <div className="bg-muted/50 flex flex-col gap-1 rounded-md p-3">
          <p className="text-sm font-medium">{t("returns.capitalTitle")}</p>
          <ReturnLines
            floorDays={floorDays}
            on="capital"
            returned={{
              costBdt: venture.returnOnCapital.capitalBdt,
              backBdt:
                venture.returnOnCapital.capitalBdt +
                venture.returnOnCapital.shareBdt,
              resultBdt: venture.returnOnCapital.shareBdt,
              per100: venture.returnOnCapital.per100,
              averageDays: venture.returnOnCapital.averageDays,
              perYear: venture.returnOnCapital.perYear,
            }}
          />
          <p className="text-muted-foreground text-xs">
            {t("returns.capitalHint")}
          </p>
        </div>
      ) : null}
      <p className="text-muted-foreground text-sm tabular-nums">
        {t("returns.farmsShare", { bdt: taka(venture.farmsShareBdt) })}
      </p>
      <Link
        className="self-start text-sm underline-offset-4 hover:underline"
        params={{ ventureId: venture.id }}
        to="/ventures/$ventureId"
      >
        {t("returns.openVenture")} →
      </Link>
    </Row>
  );
};

/** One finished run's rate a year, as a bar: a Season or a Venture's cattle. */
interface Bar {
  key: string;
  name: string;
  perYear: number;
}

/**
 * Each finished run's rate a year as a bar, longest first: one hue for a gain and the danger hue for a loss, the figure
 * beside it, so the sign is said in words as well as colour. Runs without a rate a year are not drawn.
 */
export const ReturnsChart = ({ page }: { page: ReturnsPage }) => {
  const { t } = useLanguage();
  const named = useSeasonName();
  const share = useShare();
  const bars: Bar[] = [
    ...page.seasons.flatMap((one) => {
      const perYear = one.returnOnCost?.perYear;
      return one.finished && typeof perYear === "number"
        ? [{ key: one.key, name: named(one), perYear }]
        : [];
    }),
    ...page.ventures.flatMap((one) => {
      const perYear = one.returnOnCost?.perYear;
      return typeof perYear === "number"
        ? [{ key: one.id, name: one.name, perYear }]
        : [];
    }),
  ].toSorted((a, b) => b.perYear - a.perYear);
  if (bars.length === 0) {
    return null;
  }
  const most = Math.max(...bars.map((one) => Math.abs(one.perYear)), 1);
  return (
    <ul className="flex flex-col gap-2">
      {bars.map((bar) => (
        <li
          className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3"
          key={bar.key}
        >
          <span className="truncate text-sm">{bar.name}</span>
          <span className="bg-muted h-5 rounded">
            <span
              className={cn(
                "block h-5 rounded",
                bar.perYear < 0 ? "bg-destructive" : "bg-primary"
              )}
              style={{ width: `${(Math.abs(bar.perYear) / most) * 100}%` }}
            />
          </span>
          <span
            className={cn(
              "text-right text-sm tabular-nums",
              bar.perYear < 0 && "text-destructive"
            )}
          >
            {t(
              bar.perYear < 0 ? "returns.perYearLoss" : "returns.perYearGain",
              { rate: share(bar.perYear) }
            )}
          </span>
        </li>
      ))}
    </ul>
  );
};

/** Every Season and settled Venture whose last animal has gone, newest first. */
export const FinishedRuns = ({ page }: { page: ReturnsPage }) => {
  const { t } = useLanguage();
  const seasons = page.seasons.filter((one) => one.finished);
  if (seasons.length === 0 && page.ventures.length === 0) {
    return (
      <EmptyState bare icon={Sprout} title={t("returns.nothingFinished")} />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {page.ventures.map((venture) => (
        <VentureRow
          floorDays={page.floorDays}
          key={venture.id}
          venture={venture}
        />
      ))}
      {seasons.map((season) => (
        <SeasonRow
          floorDays={page.floorDays}
          key={season.key}
          season={season}
        />
      ))}
    </ul>
  );
};

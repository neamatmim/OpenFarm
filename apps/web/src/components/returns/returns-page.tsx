import { startOfFarmDay } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatDigits } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Sprout } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

export type ReturnsPage = Awaited<ReturnType<typeof client.returns.page>>;
type Season = ReturnsPage["seasons"][number];
type Venture = ReturnsPage["ventures"][number];
type Returned = NonNullable<Season["returnOnCost"]>;

/** What every hundred taka made, the days it was out, and that scaled to a year: all a return line says. */
type Shares = Pick<Returned, "per100" | "averageDays" | "perYear">;

/** What the money in the farm's cattle returned: the Owner's alone. */
export const useReturns = () => useQuery(orpc.returns.page.queryOptions());

/** The words for a figure that may be a gain or a loss: the figure itself is always said unsigned. */
const SAID = {
  onCost: ["returns.onCostGain", "returns.onCostLoss"],
  onCapital: ["returns.onCapitalGain", "returns.onCapitalLoss"],
  perYear: ["returns.perYearGain", "returns.perYearLoss"],
  result: ["returns.made", "returns.lost"],
} as const satisfies Record<string, readonly [MessageKey, MessageKey]>;

/** Which of a pair of words a figure takes: the gain's at nought or above, the loss's below. */
const wordFor = (pair: readonly [MessageKey, MessageKey], figure: number) =>
  figure < 0 ? pair[1] : pair[0];

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
          year: formatDigits(
            startOfFarmDay(season.eid).getUTCFullYear(),
            language
          ),
        });
};

/** The share first, then the days its money was out, then that share scaled to a year — never the year alone. */
const ReturnLines = ({
  shares,
  floorDays,
  on,
}: {
  shares: Shares;
  floorDays: number;
  on: "onCost" | "onCapital";
}) => {
  const { t } = useLanguage();
  const lost = shares.per100 < 0;
  // A finished Season or Venture with no rate a year was out fewer days than the floor: nothing else leaves it without.
  const year =
    shares.perYear === null
      ? t("returns.underFloor", { floor: floorDays })
      : t(wordFor(SAID.perYear, shares.perYear), {
          rate: Math.abs(shares.perYear),
        });
  return (
    <div className="flex flex-col gap-0.5">
      <p className={cn("font-medium tabular-nums", lost && "text-destructive")}>
        {t(wordFor(SAID[on], shares.per100), {
          amount: Math.abs(shares.per100),
        })}
      </p>
      <p className="text-muted-foreground text-sm tabular-nums">
        {t("returns.days", { days: shares.averageDays })} · {year}
      </p>
    </div>
  );
};

/** How a rate a year was reached, opened under it, signed as it was worked: a loss is a share below nothing. */
const Working = ({ returned }: { returned: Returned }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <details className="text-muted-foreground text-sm">
      <summary className="cursor-pointer underline-offset-4 select-none hover:underline">
        {t("returns.working")}
      </summary>
      <p className="mt-1 max-w-prose">
        {t("returns.workingText", {
          cost: taka(returned.costBdt),
          back: taka(returned.backBdt),
          days: returned.averageDays,
        })}{" "}
        {returned.perYear === null
          ? null
          : t("returns.workingYear", {
              share: returned.per100,
              days: returned.averageDays,
              rate: returned.perYear,
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
      {t(wordFor(SAID.result, bdt), { bdt: taka(Math.abs(bdt)) })}
    </span>
  );
};

/** One finished Season or Venture, closed to its name and result, opening into how it was worked. */
const Row = ({
  kind,
  name,
  head,
  died,
  returned,
  floorDays,
  children,
}: {
  kind: "returns.season" | "returns.venture";
  name: string;
  head: number;
  died: number;
  returned: Returned;
  floorDays: number;
  children?: ReactNode;
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
            <StatusBadge tone="neutral">{t(kind)}</StatusBadge>
            <span className="text-muted-foreground text-sm">
              {t("returns.head", { count: head })}
              {died > 0 ? ` · ${t("returns.died", { count: died })}` : ""}
            </span>
          </span>
          <Result bdt={returned.resultBdt} />
        </summary>
        <div className="flex flex-col gap-3 border-t p-4">
          <ReturnLines floorDays={floorDays} on="onCost" shares={returned} />
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
  const named = useSeasonName();
  if (!season.returnOnCost) {
    return null;
  }
  return (
    <Row
      died={season.died}
      floorDays={floorDays}
      head={season.head}
      kind="returns.season"
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
      kind="returns.venture"
      name={venture.name}
      returned={venture.returnOnCost}
    >
      {venture.returnOnCapital ? (
        <div className="bg-muted/50 flex flex-col gap-1 rounded-md p-3">
          <p className="text-sm font-medium">{t("returns.capitalTitle")}</p>
          <ReturnLines
            floorDays={floorDays}
            on="onCapital"
            shares={venture.returnOnCapital}
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

/** One finished Season's or Venture's rate a year, as a bar. */
interface Bar {
  key: string;
  name: string;
  perYear: number;
}

/**
 * Each finished Season's and settled Venture's rate a year as a bar, longest first: one hue for a gain and the danger
 * hue for a loss, the figure beside it, so the sign is said in words as well as colour. One with no rate a year — out
 * fewer days than the floor, or not finished — is not drawn.
 */
export const ReturnsChart = ({ page }: { page: ReturnsPage }) => {
  const { t } = useLanguage();
  const named = useSeasonName();
  const bars: Bar[] = [
    ...page.seasons.flatMap((one) => {
      const perYear = one.returnOnCost?.perYear;
      return typeof perYear === "number"
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
            {t(wordFor(SAID.perYear, bar.perYear), {
              rate: Math.abs(bar.perYear),
            })}
          </span>
        </li>
      ))}
    </ul>
  );
};

/** Every Season and settled Venture whose last animal has gone, together, the newest window first. */
export const FinishedReturns = ({ page }: { page: ReturnsPage }) => {
  const { t } = useLanguage();
  const rows = [
    ...page.seasons
      .filter((one) => one.finished)
      .map((season) => ({
        key: season.key,
        start: season.window.start,
        row: (
          <SeasonRow
            floorDays={page.floorDays}
            key={season.key}
            season={season}
          />
        ),
      })),
    ...page.ventures.map((venture) => ({
      key: venture.id,
      start: venture.window.start,
      row: (
        <VentureRow
          floorDays={page.floorDays}
          key={venture.id}
          venture={venture}
        />
      ),
    })),
  ].toSorted(
    (a, b) => b.start.localeCompare(a.start) || a.key.localeCompare(b.key)
  );
  if (rows.length === 0) {
    return (
      <EmptyState bare icon={Sprout} title={t("returns.nothingFinished")} />
    );
  }
  return <ul className="flex flex-col gap-2">{rows.map((one) => one.row)}</ul>;
};

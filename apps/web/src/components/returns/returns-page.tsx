import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Sprout } from "lucide-react";
import type { ReactNode } from "react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { useIsOwner } from "@/components/fattening/animal-prices";
import {
  EmptyState,
  Notice,
  StatusBadge,
  SECTION_TITLE,
} from "@/components/page";
import { Gaps } from "@/components/returns/gaps";
import type {
  BankRateSaid,
  Gap,
  Returned,
  ReturnsPage,
  Running,
  Season,
  Venture,
} from "@/components/returns/return-figure";
import { SAID, isLoss, wordFor } from "@/components/returns/return-figure";
import {
  Result,
  ReturnLines,
  RunningLines,
  ShareUnder,
  SinceSettlement,
  Working,
  useSeasonName,
} from "@/components/returns/return-words";
import { SeasonBreakdown } from "@/components/returns/season-breakdown";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

/** What the money in the farm's cattle returned: the Owner's alone. */
export const useReturns = () => useQuery(orpc.returns.list.queryOptions());

/** Newest window first, then by key, so two with one window keep one order. */
const newestFirst = (
  a: { start: string; key: string },
  b: { start: string; key: string }
) => b.start.localeCompare(a.start) || a.key.localeCompare(b.key);

/** Whether a Venture's last animal has gone, as the server says: then it has a result, settled or not — until then a
 *  range. An answer this phone kept from before the server said so has only its result to go by. */
const isFinished = (
  one: Pick<Venture, "returnOnCost"> & { finished?: boolean }
): boolean => one.finished ?? one.returnOnCost !== null;

/** How one finished Season or Venture was worked: its return beside the Bank Rate, the working, and what it alone
 *  has — on a phone inside its closed row, on a desk under its table row. */
const RowBody = ({
  bank,
  floorDays,
  returned,
  children,
}: {
  bank: BankRateSaid | null;
  floorDays: number;
  returned: Returned;
  children?: ReactNode;
}) => (
  <div className="flex flex-col gap-3">
    <ReturnLines
      bank={bank}
      floorDays={floorDays}
      on="onCost"
      shares={returned}
    />
    <Working returned={returned} />
    {children}
  </div>
);

/** One finished Season or Venture, closed to its name and result, opening into how it was worked. */
const Row = ({
  kind,
  name,
  head,
  died,
  lost = 0,
  returned,
  bank,
  floorDays,
  settlementToCome = false,
  children,
}: {
  kind: "returns.season" | "returns.venture";
  name: string;
  head: number;
  died: number;
  /** Written off as Lost: the Farm's own Seasons only. */
  lost?: number;
  returned: Returned;
  bank: BankRateSaid | null;
  floorDays: number;
  /** A Venture whose last animal has gone, its Settlement not yet paid out. */
  settlementToCome?: boolean;
  children?: ReactNode;
}) => {
  const { t } = useLanguage();
  return (
    <li>
      <details className="group surface">
        <summary className="flex cursor-pointer list-none flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <span className="flex flex-wrap items-center gap-2">
            <ChevronDown
              aria-hidden
              className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
            />
            <span className="font-medium">{name}</span>
            <StatusBadge tone="neutral">{t(kind)}</StatusBadge>
            {settlementToCome ? (
              <StatusBadge tone="warning">
                {t("returns.settlementToCome")}
              </StatusBadge>
            ) : null}
            <span className="text-muted-foreground text-sm">
              {t("returns.head", { count: head })}
              {died > 0 ? ` · ${t("returns.died", { count: died })}` : ""}
              {lost > 0 ? ` · ${t("returns.lostHead", { count: lost })}` : ""}
            </span>
          </span>
          <span className="flex flex-col gap-0.5 ps-6 sm:items-end sm:ps-0">
            <span className="font-medium">
              <Result amount={returned.resultMoney} />
            </span>
            <ShareUnder per100={returned.per100} />
          </span>
        </summary>
        <div className="border-t p-4">
          <RowBody bank={bank} floorDays={floorDays} returned={returned}>
            {children}
          </RowBody>
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
      bank={season.bankRate}
      died={season.died}
      lost={season.lost}
      floorDays={floorDays}
      head={season.head}
      kind="returns.season"
      name={named(season)}
      returned={season.returnOnCost}
    >
      <SeasonBreakdown seasonKey={season.key} />
    </Row>
  );
};

/** What a finished Venture has that a Season has not: its Settlement still to come, how far it has moved since, its
 *  return on capital, the Farm's share, and the way to its page. */
const VentureExtras = ({
  venture,
  floorDays,
}: {
  venture: Venture;
  floorDays: number;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const settlementToCome = !venture.settled;
  return (
    <>
      {settlementToCome ? (
        <p className="text-muted-foreground text-sm">
          {t("returns.settlementToComeHint")}
        </p>
      ) : null}
      <SinceSettlement amount={venture.sinceSettlementMoney} />
      {venture.returnOnCapital ? (
        <div className="bg-muted/50 flex flex-col gap-1 rounded-md p-3">
          <p className="text-sm font-medium">{t("returns.capitalTitle")}</p>
          <ReturnLines
            bank={venture.capitalBankRate}
            floorDays={floorDays}
            on="onCapital"
            shares={venture.returnOnCapital}
          />
          <p className="text-muted-foreground text-xs">
            {t("returns.capitalHint")}
          </p>
        </div>
      ) : null}
      {venture.farmsShareMoney === null ? null : (
        <p className="text-muted-foreground text-sm tabular-nums">
          {t("returns.farmsShare", {
            amount: asMoney(venture.farmsShareMoney),
          })}
        </p>
      )}
      <Link
        className="self-start text-sm underline-offset-4 hover:underline"
        params={{ ventureId: venture.id }}
        to="/ventures/$ventureId"
      >
        {t("returns.openVenture")} →
      </Link>
    </>
  );
};

const VentureRow = ({
  venture,
  floorDays,
}: {
  venture: Venture;
  floorDays: number;
}) => {
  if (!venture.returnOnCost) {
    return null;
  }
  const settlementToCome = !venture.settled;
  return (
    <Row
      bank={venture.bankRate}
      died={venture.died}
      floorDays={floorDays}
      head={venture.head}
      kind="returns.venture"
      name={venture.name}
      returned={venture.returnOnCost}
      settlementToCome={settlementToCome}
    >
      <VentureExtras venture={venture} floorDays={floorDays} />
    </Row>
  );
};

/** One finished Season's or Venture's rate a year, as a bar. */
interface Bar {
  key: string;
  name: string;
  perYear: number;
  /** The Bank Rate it is set beside, marked on its bar. */
  bank: number | null;
}

/** How much longer the scale runs than the longest bar or bank mark. */
const CHART_HEADROOM = 1.25;

/** A Season or a Venture's cattle as a bar: drawn only with a rate a year. */
const barOf = (
  key: string,
  name: string,
  returned: Returned | null,
  bank: BankRateSaid | null
): Bar[] =>
  typeof returned?.perYear === "number"
    ? [{ key, name, perYear: returned.perYear, bank: bank?.perYear ?? null }]
    : [];

/**
 * Each finished Season's and settled Venture's rate a year as a bar, longest first: one hue for a gain and the danger
 * hue for a loss, the figure beside it, so the sign is said in words as well as colour. One with no rate a year — out
 * fewer days than the floor, or not finished — is not drawn.
 */
export const ReturnsChart = ({ page }: { page: ReturnsPage }) => {
  const { t } = useLanguage();
  const named = useSeasonName();
  const bars: Bar[] = [
    ...page.seasons.flatMap((one) =>
      barOf(one.key, named(one), one.returnOnCost, one.bankRate)
    ),
    ...page.ventures.flatMap((one) =>
      barOf(one.id, one.name, one.returnOnCost, one.bankRate)
    ),
  ].toSorted((a, b) => b.perYear - a.perYear);
  if (bars.length === 0) {
    return null;
  }
  // A little room past the longest, so one Season alone is not a bar the width of the page.
  const most =
    Math.max(
      ...bars.map((one) => Math.max(Math.abs(one.perYear), one.bank ?? 0)),
      1
    ) * CHART_HEADROOM;
  const anyBank = bars.some((one) => one.bank !== null);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-3">
        {bars.map((bar) => (
          <li
            className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-4"
            key={bar.key}
          >
            <span className="truncate text-sm font-medium">{bar.name}</span>
            <span className="bg-muted relative h-2.5 rounded-full">
              <span
                className={cn(
                  "block h-2.5 rounded-full",
                  isLoss(bar.perYear) ? "bg-danger" : "bg-primary"
                )}
                style={{ width: `${(Math.abs(bar.perYear) / most) * 100}%` }}
              />
              {bar.bank === null ? null : (
                <span
                  aria-hidden
                  className="bg-foreground/70 absolute -top-1.5 -bottom-1.5 w-0.5 rounded-full"
                  style={{ left: `${(bar.bank / most) * 100}%` }}
                />
              )}
            </span>
            <span
              className={cn(
                "text-end text-sm tabular-nums",
                isLoss(bar.perYear) && "text-danger"
              )}
            >
              {t(wordFor(SAID.perYear, bar.perYear), {
                rate: Math.abs(bar.perYear),
              })}
            </span>
          </li>
        ))}
      </ul>
      {anyBank ? (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className="bg-foreground/70 h-3 w-0.5 rounded-full"
          />
          {t("returns.bankMark")}
        </p>
      ) : null}
    </div>
  );
};

/** Every Season and Venture whose last animal has gone, together, the newest window first — a Venture whose
 *  Settlement is still to come among them, and said so. */
/** One finished Season or Venture as the desk's table reads it. */
interface FinishedRow {
  key: string;
  start: string;
  kind: "returns.season" | "returns.venture";
  name: string;
  head: number;
  died: number;
  lost: number;
  returned: Returned;
  bank: BankRateSaid | null;
  settlementToCome: boolean;
  season: Season | null;
  venture: Venture | null;
}

interface FinishedCell {
  row: { original: FinishedRow };
}

const FinishedNameCell = ({ row }: FinishedCell) => {
  const { t } = useLanguage();
  const one = row.original;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{one.name}</span>
      <StatusBadge tone="neutral">{t(one.kind)}</StatusBadge>
      {one.settlementToCome ? (
        <StatusBadge tone="warning">
          {t("returns.settlementToCome")}
        </StatusBadge>
      ) : null}
    </span>
  );
};
const FinishedHeadCell = ({ row }: FinishedCell) => {
  const { t } = useLanguage();
  const one = row.original;
  return (
    <span className="flex flex-col">
      <span>{t("returns.head", { count: one.head })}</span>
      {one.died > 0 || one.lost > 0 ? (
        <span className="text-muted-foreground text-xs">
          {[
            one.died > 0 ? t("returns.died", { count: one.died }) : null,
            one.lost > 0 ? t("returns.lostHead", { count: one.lost }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      ) : null}
    </span>
  );
};
const FinishedResultCell = ({ row }: FinishedCell) => (
  <span className="font-medium">
    <Result amount={row.original.returned.resultMoney} />
  </span>
);
const FinishedShareCell = ({ row }: FinishedCell) => (
  <ShareUnder per100={row.original.returned.per100} />
);

const finishedColumn = createListColumns<FinishedRow>();
const finishedColumns = finishedColumn.columns([
  finishedColumn.accessor("name", {
    header: listHeader("returns.col.what"),
    cell: FinishedNameCell,
  }),
  finishedColumn.accessor("head", {
    header: listHeader("returns.col.head"),
    cell: FinishedHeadCell,
    meta: { align: "end" },
  }),
  finishedColumn.accessor((one) => one.returned.resultMoney, {
    id: "result",
    header: listHeader("returns.col.result"),
    cell: FinishedResultCell,
    meta: { align: "end" },
  }),
  finishedColumn.accessor((one) => one.returned.per100, {
    id: "share",
    header: listHeader("returns.col.share"),
    cell: FinishedShareCell,
    meta: { align: "end" },
  }),
]);

/** Under a finished row on a desk: how it was worked, and a Season's breakdown or a Venture's own lines. */
const FinishedDetail = ({
  row,
  floorDays,
}: {
  row: FinishedRow;
  floorDays: number;
}) => (
  <RowBody bank={row.bank} floorDays={floorDays} returned={row.returned}>
    {row.season ? <SeasonBreakdown seasonKey={row.season.key} /> : null}
    {row.venture ? (
      <VentureExtras floorDays={floorDays} venture={row.venture} />
    ) : null}
  </RowBody>
);

/** On a desk, every finished Season and Venture a row — what, head, result, and on every hundred — sortable, newest
 *  first, each opening to how it was worked (Polaris's index table, Carbon's expandable rows). */
const FinishedTable = ({
  rows,
  floorDays,
}: {
  rows: FinishedRow[];
  floorDays: number;
}) => {
  const table = useListTable({
    columns: finishedColumns,
    data: rows,
    getRowId: (one) => one.key,
  });
  return (
    <DataTable
      renderDetail={(row) => <FinishedDetail floorDays={floorDays} row={row} />}
      table={table}
    />
  );
};

export const FinishedReturns = ({ page }: { page: ReturnsPage }) => {
  const { t } = useLanguage();
  const named = useSeasonName();
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
    ...page.ventures.filter(isFinished).map((venture) => ({
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
  ].toSorted(newestFirst);
  if (rows.length === 0) {
    return (
      <EmptyState bare icon={Sprout} title={t("returns.nothingFinished")} />
    );
  }
  const desk: FinishedRow[] = [
    ...page.seasons
      .filter((one) => one.finished)
      .flatMap((season) =>
        season.returnOnCost
          ? [
              {
                key: season.key,
                start: season.window.start,
                kind: "returns.season" as const,
                name: named(season),
                head: season.head,
                died: season.died,
                lost: season.lost,
                returned: season.returnOnCost,
                bank: season.bankRate,
                settlementToCome: false,
                season,
                venture: null,
              },
            ]
          : []
      ),
    ...page.ventures.filter(isFinished).flatMap((venture) =>
      venture.returnOnCost
        ? [
            {
              key: venture.id,
              start: venture.window.start,
              kind: "returns.venture" as const,
              name: venture.name,
              head: venture.head,
              died: venture.died,
              lost: 0,
              returned: venture.returnOnCost,
              bank: venture.bankRate,
              settlementToCome: !venture.settled,
              season: null,
              venture,
            },
          ]
        : []
    ),
  ].toSorted(newestFirst);
  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((one) => one.row)}
      </ul>
      <div className="hidden md:block">
        <FinishedTable floorDays={page.floorDays} rows={desk} />
      </div>
    </>
  );
};

/** An answer the phone kept from before a Season carried its running range has neither: read as none. */
const gapsOf = (one: { gaps?: Gap[] }): Gap[] => one.gaps ?? [];
const runningOf = (one: { running?: Running | null }): Running | null =>
  one.running ?? null;

/** The running figure and its gaps, or only the gaps where nothing could be valued. */
const StillGoingBody = ({
  running,
  gaps,
  ventureId,
}: {
  running: Running | null;
  gaps: Gap[];
  ventureId: string | null;
}) => (
  <div className="flex flex-col gap-3">
    {running ? <RunningLines running={running} /> : null}
    <Gaps gaps={gaps} ventureId={ventureId} />
  </div>
);

/** Every standing animal the page could not value, gathered at its top so the Owner sees what to put right first. */
export const MissingPrices = ({ page }: { page: ReturnsPage }) => {
  const { t } = useLanguage();
  // An answer kept from before the dairy herd was on the page has none of it.
  const dairy = page.dairy ?? null;
  const count = [
    ...page.seasons.flatMap(gapsOf),
    ...page.ventures.flatMap(gapsOf),
    ...(dairy?.herdNow.gaps ?? []),
    ...(dairy?.gone.flatMap(gapsOf) ?? []),
  ].length;
  if (count === 0) {
    return null;
  }
  return (
    <Notice title={t("returns.missingTitle", { count })} tone="warning">
      {t("returns.missingHint")}
    </Notice>
  );
};

interface StillGoingRow {
  key: string;
  name: string;
  kind: "returns.season" | "returns.venture";
  ventureId: string | null;
  running: Running | null;
  gaps: Gap[];
}

const StillGoingList = ({ rows }: { rows: StillGoingRow[] }) => {
  const { t } = useLanguage();
  if (rows.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li className="surface flex flex-col gap-3 p-4" key={row.key}>
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.name}</span>
            <StatusBadge tone="neutral">{t(row.kind)}</StatusBadge>
          </span>
          <StillGoingBody
            gaps={row.gaps}
            running={row.running}
            ventureId={row.ventureId}
          />
        </li>
      ))}
    </ul>
  );
};

/** Every Season and Venture still going, the newest window first, each at today's price. */
export const StillGoing = ({ page }: { page: ReturnsPage }) => {
  const named = useSeasonName();
  const rows = [
    ...page.seasons
      .filter((one) => !one.finished)
      .map((one) => ({
        key: one.key,
        start: one.window.start,
        name: named(one),
        kind: "returns.season" as const,
        ventureId: null,
        running: runningOf(one),
        gaps: gapsOf(one),
      })),
    ...page.ventures
      .filter((one) => !isFinished(one))
      .map((one) => ({
        key: one.id,
        start: one.window.start,
        name: one.name,
        kind: "returns.venture" as const,
        ventureId: one.id,
        running: runningOf(one),
        gaps: gapsOf(one),
      })),
  ].toSorted(newestFirst);
  return <StillGoingList rows={rows} />;
};

/**
 * The Seasons still going, above the Fattening board: each at today's price, with what it could not value, and the way
 * to the Returns page. The Owner's alone, as the animal prices are.
 */
export const RunningSeasonsStrip = ({
  className,
}: {
  /** Where it sits in a row of cards: how it grows beside them. */
  className?: string;
}) => {
  const { t } = useLanguage();
  const named = useSeasonName();
  // Asked only for the Owner: a Manager's board never sends a request the server would refuse.
  const owner = useIsOwner();
  const going = useQuery({
    ...orpc.returns.runningSeasons.queryOptions(),
    enabled: owner,
  });
  if (!going.data || going.data.length === 0) {
    return null;
  }
  return (
    <div className={cn("surface flex flex-col gap-3 p-4", className)}>
      {going.data.map((season) => (
        <div className="flex flex-col gap-2" key={season.key}>
          <p className="font-medium">{named(season)}</p>
          <StillGoingBody
            gaps={gapsOf(season)}
            running={runningOf(season)}
            ventureId={null}
          />
        </div>
      ))}
      <Link
        className="self-start text-sm underline-offset-4 hover:underline"
        to="/returns"
      >
        {t("returns.seeAll")} →
      </Link>
    </div>
  );
};

/**
 * What one Venture returns, on its own page: settled, its Return on Cost and the Investors' Return on Capital; still
 * going, its range at today's price. Nothing before it has cattle.
 */
export const VentureReturnsPanel = ({ ventureId }: { ventureId: string }) => {
  const { t } = useLanguage();
  const read = useQuery(
    orpc.returns.venture.queryOptions({ input: { ventureId } })
  );
  const venture = read.data;
  if (!venture || venture.head === 0) {
    return null;
  }
  return (
    <section className="surface flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-1">
        <h2 className={SECTION_TITLE}>{t("returns.panelTitle")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("returns.panelHint")}
        </p>
      </div>
      {venture.returnOnCost ? (
        <>
          <ReturnLines
            bank={venture.bankRate}
            floorDays={venture.floorDays}
            on="onCost"
            shares={venture.returnOnCost}
          />
          <SinceSettlement amount={venture.sinceSettlementMoney} />
          {venture.settled ? null : (
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge tone="warning">
                {t("returns.settlementToCome")}
              </StatusBadge>
              {t("returns.settlementToComeHint")}
            </p>
          )}
        </>
      ) : (
        <StillGoingBody
          gaps={gapsOf(venture)}
          running={runningOf(venture)}
          ventureId={venture.id}
        />
      )}
      {venture.returnOnCapital ? (
        <ReturnLines
          bank={venture.capitalBankRate}
          floorDays={venture.floorDays}
          on="onCapital"
          shares={venture.returnOnCapital}
        />
      ) : null}
      <Link
        className="self-start text-sm underline-offset-4 hover:underline"
        to="/returns"
      >
        {t("returns.seeAll")} →
      </Link>
    </section>
  );
};

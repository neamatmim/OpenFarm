import { farmDayOf, priceAtWeight, startOfFarmDay } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@OpenFarm/ui/components/table";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Landmark, Scale, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { useIsOwner } from "@/components/fattening/animal-prices";
import { bandSaid } from "@/components/feed/band-words";
import { EmptyState, StatusBadge } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { Chip } from "@/components/saw-filter";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import { aFigure, figureOf } from "@/lib/typed-figure";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

export type ReturnsPage = Awaited<ReturnType<typeof client.returns.page>>;
type Season = ReturnsPage["seasons"][number];
type Venture = ReturnsPage["ventures"][number];
type Returned = NonNullable<Season["returnOnCost"]>;
type BankRateSaid = NonNullable<Season["bankRate"]>;

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

/** Newest window first, then by key, so two with one window keep one order. */
const newestFirst = (
  a: { start: string; key: string },
  b: { start: string; key: string }
) => b.start.localeCompare(a.start) || a.key.localeCompare(b.key);

/** Before Ventures still going were on the page, every Venture on it was settled. */
const isSettled = (one: { settled?: boolean }): boolean => one.settled ?? true;

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

/** What every hundred taka made, said as made or lost, a loss in the loss's colour: a return line's first words. */
export const ShareSaid = ({
  per100,
  on,
  className,
}: {
  per100: number;
  on: "onCost" | "onCapital";
  className?: string;
}) => {
  const { t } = useLanguage();
  return (
    <p
      className={cn(
        "tabular-nums",
        per100 < 0 && "text-destructive",
        className
      )}
    >
      {t(wordFor(SAID[on], per100), { amount: Math.abs(per100) })}
    </p>
  );
};

/** The share first, then the days its money was out, then that share scaled to a year — never the year alone. */
export const ReturnLines = ({
  shares,
  floorDays,
  on,
  bank,
}: {
  shares: Shares;
  floorDays: number;
  on: "onCost" | "onCapital";
  /** The Bank Rate beside it, as a plain line: only beside a rate a year, and only once one is typed. */
  bank: BankRateSaid | null;
}) => {
  const { t } = useLanguage();
  // A finished Season or Venture with no rate a year was out fewer days than the floor: nothing else leaves it without.
  const year =
    shares.perYear === null
      ? t("returns.underFloor", { floor: floorDays })
      : t(wordFor(SAID.perYear, shares.perYear), {
          rate: Math.abs(shares.perYear),
        });
  return (
    <div className="flex flex-col gap-0.5">
      <ShareSaid className="font-medium" on={on} per100={shares.per100} />
      <p className="text-muted-foreground text-sm tabular-nums">
        {t("returns.days", { days: shares.averageDays })} · {year}
      </p>
      {bank && shares.perYear !== null ? (
        <p className="text-muted-foreground text-xs tabular-nums">
          {t("returns.bankLine", { rate: bank.perYear, note: bank.note })}
        </p>
      ) : null}
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
export const Result = ({ bdt }: { bdt: number }) => {
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
  bank,
  floorDays,
  children,
}: {
  kind: "returns.season" | "returns.venture";
  name: string;
  head: number;
  died: number;
  returned: Returned;
  bank: BankRateSaid | null;
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
          <ReturnLines
            bank={bank}
            floorDays={floorDays}
            on="onCost"
            shares={returned}
          />
          <Working returned={returned} />
          {children}
        </div>
      </details>
    </li>
  );
};

type BreakdownBy = Parameters<typeof client.returns.breakdown>[0]["by"];
type BreakdownRow = Awaited<
  ReturnType<typeof client.returns.breakdown>
>[number];
type BreakdownLine = BreakdownRow["line"];

/** Every way a finished Season opens out, and its chip's word: a way the server adds is a type error here until named. */
const BY_WORD = {
  haat: "returns.by.haat",
  trader: "returns.by.trader",
  breed: "returns.by.breed",
  band: "returns.by.band",
  animal: "returns.by.animal",
} as const satisfies Record<BreakdownBy, MessageKey>;

/** The ways, in the order the chips offer them. */
const OPEN_BY = Object.keys(BY_WORD) as (keyof typeof BY_WORD)[];

/** A line with none of it written: what "none" means depends on what it was opened by. An Animal is always herself. */
const NONE_WORD = {
  haat: "returns.none.haat",
  trader: "returns.none.trader",
  breed: "returns.none.breed",
  band: "returns.none.band",
} as const satisfies Record<Exclude<BreakdownBy, "animal">, MessageKey>;

export const LEFT_WORD = {
  sold: "returns.left.sold",
  died: "returns.left.died",
  sold_to_venture: "returns.left.sold_to_venture",
  crossed: "returns.left.crossed",
} as const satisfies Record<string, MessageKey>;

const JOINED_WORD = {
  crossed: "returns.joined.crossed",
  bought_from_venture: "returns.joined.bought_from_venture",
} as const satisfies Record<string, MessageKey>;

const CAME_WORD = {
  intake: "returns.came.intake",
  crossed: "returns.came.crossed",
  bought_from_venture: "returns.came.bought_from_venture",
} as const satisfies Record<string, MessageKey>;

/** What a breakdown line is called in the reader's words. */
const useLineSaid = () => {
  const words = useLanguage();
  const { t, language } = words;
  return (line: BreakdownLine, by: BreakdownBy): string => {
    switch (line.kind) {
      case "named": {
        return language === "en" && line.nameEn ? line.nameEn : line.name;
      }
      case "band": {
        return bandSaid(line, words) ?? t(NONE_WORD.band);
      }
      case "none": {
        return by === "animal" ? "" : t(NONE_WORD[by]);
      }
      case "animal": {
        return line.tagNumber;
      }
      default: {
        return t(JOINED_WORD[line.kind]);
      }
    }
  };
};

/** The lines of one breakdown: each the Season's own sum for its animals — head, the dead, cost to back, share. */
const BreakdownTable = ({
  rows,
  by,
}: {
  rows: BreakdownRow[];
  by: BreakdownBy;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const said = useLineSaid();
  return (
    <Table>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={JSON.stringify(row.line)}>
            <TableCell className="font-medium whitespace-normal">
              {row.line.kind === "animal" ? (
                <Link
                  className="underline-offset-4 hover:underline"
                  params={{ tagNumber: row.line.tagNumber }}
                  to="/animals/$tagNumber"
                >
                  {said(row.line, by)}
                </Link>
              ) : (
                said(row.line, by)
              )}
              <span className="text-muted-foreground block text-xs font-normal">
                {row.line.kind === "animal"
                  ? t("returns.cameLeft", {
                      came: t(CAME_WORD[row.line.came]),
                      left: t(LEFT_WORD[row.line.left]),
                    })
                  : `${t("returns.head", { count: row.head })}${
                      row.died > 0
                        ? ` · ${t("returns.died", { count: row.died })}`
                        : ""
                    }`}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground whitespace-normal tabular-nums">
              {t("returns.costBack", {
                cost: taka(row.costBdt),
                back: taka(row.backBdt),
              })}
            </TableCell>
            <TableCell className="whitespace-normal">
              {row.per100 === null ? null : (
                <ShareSaid on="onCost" per100={row.per100} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/**
 * A finished Season opened out by haat, trader, breed, buying weight or each animal — asked for only when the Owner
 * picks a way, so a page of Seasons is not a page of breakdowns. A share on every line, never a rate a year.
 */
const SeasonBreakdown = ({ seasonKey }: { seasonKey: string }) => {
  const { t } = useLanguage();
  const [by, setBy] = useState<BreakdownBy | null>(null);
  const opened = useQuery({
    ...orpc.returns.breakdown.queryOptions({
      input: { seasonKey, by: by ?? "haat" },
    }),
    enabled: by !== null,
  });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">{t("returns.openBy")}</p>
      <div className="flex flex-wrap gap-2">
        {OPEN_BY.map((one) => (
          <Chip
            chosen={by === one}
            key={one}
            label={t(BY_WORD[one])}
            onChoose={() => setBy(by === one ? null : one)}
          />
        ))}
      </div>
      {by !== null && opened.error ? (
        <p className="text-destructive text-sm">
          {wordedRefusal(opened.error, t) ?? t("returns.breakdownFailed")}
        </p>
      ) : null}
      {by !== null && opened.data ? (
        <>
          {opened.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("returns.breakdownNone")}
            </p>
          ) : (
            <BreakdownTable by={by} rows={opened.data} />
          )}
          <p className="text-muted-foreground max-w-prose text-xs">
            {t("returns.breakdownNote")}
          </p>
        </>
      ) : null}
    </div>
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

const VentureRow = ({
  venture,
  floorDays,
}: {
  venture: Venture;
  floorDays: number;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  if (!(venture.returnOnCost && venture.farmsShareBdt !== null)) {
    return null;
  }
  return (
    <Row
      bank={venture.bankRate}
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
  /** The Bank Rate it is set beside, marked on its bar. */
  bank: number | null;
}

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
  const most = Math.max(
    ...bars.map((one) => Math.max(Math.abs(one.perYear), one.bank ?? 0)),
    1
  );
  const anyBank = bars.some((one) => one.bank !== null);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {bars.map((bar) => (
          <li
            className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3"
            key={bar.key}
          >
            <span className="truncate text-sm">{bar.name}</span>
            <span className="bg-muted relative h-5 rounded">
              <span
                className={cn(
                  "block h-5 rounded",
                  bar.perYear < 0 ? "bg-destructive" : "bg-primary"
                )}
                style={{ width: `${(Math.abs(bar.perYear) / most) * 100}%` }}
              />
              {bar.bank === null ? null : (
                <span
                  aria-hidden
                  className="border-foreground/60 absolute -top-1 -bottom-1 border-l-2 border-dashed"
                  style={{ left: `${(bar.bank / most) * 100}%` }}
                />
              )}
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
      {anyBank ? (
        <p className="text-muted-foreground text-xs">{t("returns.bankMark")}</p>
      ) : null}
    </div>
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
    ...page.ventures.filter(isSettled).map((venture) => ({
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
  return <ul className="flex flex-col gap-2">{rows.map((one) => one.row)}</ul>;
};

/** What the Owner types a Bank Rate as, before it is a figure. */
interface TypedRate {
  perYear: string;
  note: string;
  fromDay: string;
}

const BankRateSheet = ({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const today = farmDayOf(new Date());
  const [typed, setTyped] = useState<TypedRate>({
    perYear: "",
    note: "",
    fromDay: today,
  });
  const saving = useMutation(
    orpc.returns.setBankRate.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("returns.bankSaved"));
      },
    })
  );
  const perYear = figureOf(typed.perYear);
  const ready =
    aFigure(perYear) &&
    typed.note.trim().length > 0 &&
    typed.fromDay.length > 0;
  return (
    <FormSheet
      description={t("returns.bankHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        saving.mutate({
          perYear: perYear ?? 0,
          note: typed.note.trim(),
          fromDay: typed.fromDay,
        })
      }
      open
      pending={saving.isPending}
      ready={ready}
      submitLabel={t("returns.bankSet")}
      title={t("returns.bankSet")}
    >
      <FormField id="bank-per-year" label={t("returns.bankPerYear")}>
        <Input
          autoComplete="off"
          id="bank-per-year"
          inputMode="decimal"
          onChange={(event) =>
            setTyped({ ...typed, perYear: event.target.value })
          }
          value={typed.perYear}
        />
      </FormField>
      <FormField
        hint={t("returns.bankNoteHint")}
        id="bank-note"
        label={t("returns.bankNote")}
      >
        <Input
          autoComplete="off"
          id="bank-note"
          onChange={(event) => setTyped({ ...typed, note: event.target.value })}
          value={typed.note}
        />
      </FormField>
      <FormField
        hint={t("returns.bankFromDayHint")}
        id="bank-from"
        label={t("returns.bankFromDay")}
      >
        <Input
          id="bank-from"
          max={today}
          onChange={(event) =>
            setTyped({ ...typed, fromDay: event.target.value })
          }
          type="date"
          value={typed.fromDay}
        />
      </FormField>
    </FormSheet>
  );
};

/**
 * Every Bank Rate the Owner has typed, the one in force today first, and the act that types another. Kept, never
 * edited: a rate put right is typed again from the same day.
 */
export const BankRateList = ({ page }: { page: ReturnsPage }) => {
  const { t, language } = useLanguage();
  const [setting, setSetting] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {page.bankRates.length === 0 ? (
        <EmptyState bare icon={Landmark} title={t("returns.bankNone")} />
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {page.bankRates.map((one) => (
            <li
              className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between"
              key={one.id}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium tabular-nums">
                  {t("returns.bankLine", { rate: one.perYear, note: one.note })}
                </span>
                {one.id === page.bankRateInForceId ? (
                  <StatusBadge tone="success">
                    {t("returns.bankInForce")}
                  </StatusBadge>
                ) : null}
              </span>
              <span className="text-muted-foreground text-sm">
                {t("returns.bankFrom", {
                  day: formatDate(startOfFarmDay(one.fromDay), language),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button
        className="self-start"
        onClick={() => setSetting(true)}
        size="sm"
        variant="outline"
      >
        {t("returns.bankSet")}
      </Button>
      {setting ? <BankRateSheet onOpenChange={setSetting} /> : null}
    </div>
  );
};

export type Running = NonNullable<Season["running"]>;
export type Gap = Season["gaps"][number];

/** An answer the phone kept from before a Season carried its running range has neither: read as none. */
const gapsOf = (one: { gaps?: Gap[] }): Gap[] => one.gaps ?? [];
const runningOf = (one: { running?: Running | null }): Running | null =>
  one.running ?? null;

/** The range at today's price, said as made, lost, or from lost to made — never a bare minus sign. */
export const TodayRange = ({ running }: { running: Running }) => {
  const { t } = useLanguage();
  const low = running.low.per100;
  const high = running.high.per100;
  if (low >= 0) {
    return <>{t("returns.todayRangeGain", { low, high })}</>;
  }
  if (high < 0) {
    return (
      <>
        {t("returns.todayRangeLoss", {
          least: Math.abs(high),
          most: Math.abs(low),
        })}
      </>
    );
  }
  return (
    <>{t("returns.todayRangeMixed", { loss: Math.abs(low), gain: high })}</>
  );
};

/**
 * A Season or a Venture still going, at today's price: the range, labelled an estimate, then the part gone and the part
 * standing apart, and the days so far — never a year.
 */
export const RunningLines = ({ running }: { running: Running }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-center gap-2 font-medium tabular-nums">
        <TodayRange running={running} />
        <StatusBadge tone="warning">{t("returns.estimate")}</StatusBadge>
      </p>
      {running.soldCostBdt === 0 ? null : (
        <p className="text-muted-foreground text-sm tabular-nums">
          {t(
            running.soldResultBdt < 0 ? "returns.goneLost" : "returns.goneMade",
            {
              bdt: taka(Math.abs(running.soldResultBdt)),
            }
          )}
        </p>
      )}
      <p className="text-muted-foreground text-sm tabular-nums">
        {t("returns.standingWorth", {
          cost: taka(running.standingCostBdt),
          low: taka(running.standingLowBdt),
          high: taka(running.standingHighBdt),
        })}
      </p>
      <p className="text-muted-foreground text-xs tabular-nums">
        {t("returns.daysSoFar", { days: running.low.averageDays })}
      </p>
    </div>
  );
};

/** Where what puts a gap right is done: a weight on her page, a Venture's price on its plan, the farm's on the board. */
const GapFix = ({ gap, ventureId }: { gap: Gap; ventureId: string | null }) => {
  const { t } = useLanguage();
  const className = "text-sm underline-offset-4 hover:underline";
  const label = t(`returns.fix.${gap.why}`);
  if (gap.why === "no_milk_price") {
    return (
      <Link className={className} to="/milk">
        {label}
      </Link>
    );
  }
  const onThePricesTab =
    gap.why === "not_priced" ||
    gap.why === "no_entry_price" ||
    gap.why === "no_head_price";
  if (onThePricesTab) {
    return (
      <Link className={className} search={{ tab: "prices" }} to="/returns">
        {label}
      </Link>
    );
  }
  if (gap.why === "no_weight") {
    return (
      <Link
        className={className}
        params={{ tagNumber: gap.tagNumber }}
        to="/animals/$tagNumber"
      >
        {label}
      </Link>
    );
  }
  return ventureId ? (
    <Link
      className={className}
      params={{ ventureId }}
      to="/ventures/$ventureId"
    >
      {label}
    </Link>
  ) : (
    <Link className={className} to="/fattening">
      {label}
    </Link>
  );
};

/** The standing animals left out of a figure, whole, each with what puts her right. */
export const Gaps = ({
  gaps,
  ventureId,
}: {
  gaps: Gap[];
  ventureId: string | null;
}) => {
  const { t } = useLanguage();
  if (gaps.length === 0) {
    return null;
  }
  return (
    <div className="border-warning/40 flex flex-col gap-1 rounded-md border border-dashed p-3">
      <p className="text-sm font-medium">
        {t("returns.gapsTitle", { count: gaps.length })}
      </p>
      <ul className="flex flex-col gap-1">
        {gaps.map((gap) => (
          <li
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
            key={`${gap.tagNumber}-${gap.why}`}
          >
            <span>{t(`returns.gap.${gap.why}`, { tag: gap.tagNumber })}</span>
            <GapFix gap={gap} ventureId={ventureId} />
          </li>
        ))}
      </ul>
    </div>
  );
};

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
    <div className="border-warning/40 bg-warning/5 flex flex-col gap-1 rounded-lg border p-4">
      <p className="font-medium">{t("returns.missingTitle", { count })}</p>
      <p className="text-muted-foreground text-sm">
        {t("returns.missingHint")}
      </p>
    </div>
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
        <li
          className="bg-card flex flex-col gap-3 rounded-lg border border-dashed p-4"
          key={row.key}
        >
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
      .filter((one) => !isSettled(one))
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
export const RunningSeasonsStrip = () => {
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
    <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
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
    <section className="bg-card flex flex-col gap-3 rounded-xl border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{t("returns.panelTitle")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("returns.panelHint")}
        </p>
      </div>
      {venture.returnOnCost ? (
        <ReturnLines
          bank={venture.bankRate}
          floorDays={venture.floorDays}
          on="onCost"
          shares={venture.returnOnCost}
        />
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

type Crossing = ReturnsPage["crossings"][number];

const PriceCrossingSheet = ({
  crossing,
  onOpenChange,
}: {
  crossing: Crossing;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const refused = useRefused();
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const saving = useMutation(
    orpc.returns.priceCrossing.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("returns.priceSaved"));
      },
    })
  );
  const rateBdtPerKg = figureOf(rate);
  const weightKg = crossing.weightKg ?? 0;
  const ready = aFigure(rateBdtPerKg) && note.trim().length > 0;
  return (
    <FormSheet
      description={t("returns.crossingsHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        saving.mutate({
          joiningId: crossing.id,
          rateBdtPerKg: rateBdtPerKg ?? 0,
          note: note.trim(),
        })
      }
      open
      pending={saving.isPending}
      ready={ready}
      submitLabel={t("returns.priceIt")}
      title={`${t("returns.priceTitle")} · ${crossing.tagNumber}`}
    >
      <FormField
        hint={
          aFigure(rateBdtPerKg)
            ? t("returns.priceWorks", {
                kg: weightKg,
                rate: taka(rateBdtPerKg ?? 0),
                price: taka(priceAtWeight(weightKg, rateBdtPerKg ?? 0)),
              })
            : undefined
        }
        id="crossing-rate"
        label={t("returns.rate")}
      >
        <Input
          autoComplete="off"
          id="crossing-rate"
          inputMode="decimal"
          onChange={(event) => setRate(event.target.value)}
          value={rate}
        />
      </FormField>
      <FormField id="crossing-note" label={t("returns.rateNote")}>
        <Input
          autoComplete="off"
          id="crossing-note"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};

/** What the Owner reads under a crossing: the price she came in at, else what she weighed, else that nobody has. */
const crossingSaid = (
  one: Crossing,
  t: ReturnType<typeof useLanguage>["t"],
  taka: (bdt: number) => string
): string => {
  if (one.priceBdt !== null && one.priceBdt !== undefined) {
    return t("returns.crossingPriced", {
      price: taka(one.priceBdt),
      rate: taka(one.rateBdtPerKg ?? 0),
    });
  }
  return one.weightKg === null
    ? t("returns.crossingUnweighed")
    : t("returns.crossingWeighed", { kg: one.weightKg });
};

/**
 * Every animal walked across from Dairy the Owner prices, oldest first: those still waiting on a price, with what she
 * weighed by the day she crossed and the act that prices her — or, where nobody weighed her, the word to weigh her
 * first — and those priced while she is still on the Farm, with the price and the act that puts it right.
 */
export const CrossingsToPrice = ({ page }: { page: ReturnsPage }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const [pricing, setPricing] = useState<Crossing | null>(null);
  // An answer kept from before the list carried priced crossings has none, and prices nothing again.
  const crossings = page.crossings ?? [];
  if (crossings.length === 0) {
    return <EmptyState bare icon={Scale} title={t("returns.crossingsNone")} />;
  }
  return (
    <>
      <ul className="divide-border flex flex-col divide-y">
        {crossings.map((one) => (
          <li
            className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
            key={one.id}
          >
            <span className="flex flex-col">
              <span className="font-medium">
                {t("returns.crossingLine", {
                  tag: one.tagNumber,
                  day: formatDate(startOfFarmDay(one.joinedOn), language),
                })}
              </span>
              <span className="text-muted-foreground text-sm">
                {crossingSaid(one, t, taka)}
              </span>
            </span>
            {one.weightKg === null ? (
              <Link
                className="text-sm underline-offset-4 hover:underline"
                params={{ tagNumber: one.tagNumber }}
                to="/animals/$tagNumber"
              >
                {t("returns.fix.no_weight")}
              </Link>
            ) : (
              <Button
                className="self-start"
                onClick={() => setPricing(one)}
                size="sm"
                variant="outline"
              >
                {one.priceBdt === null
                  ? t("returns.priceIt")
                  : t("returns.priceAgain")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {pricing ? (
        <PriceCrossingSheet
          crossing={pricing}
          onOpenChange={(open) => {
            if (!open) {
              setPricing(null);
            }
          }}
        />
      ) : null}
    </>
  );
};

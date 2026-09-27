import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Landmark, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, StatusBadge } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
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
  bank,
}: {
  shares: Shares;
  floorDays: number;
  on: "onCost" | "onCapital";
  /** The Bank Rate beside it, as a plain line: only beside a rate a year, and only once one is typed. */
  bank: BankRateSaid | null;
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

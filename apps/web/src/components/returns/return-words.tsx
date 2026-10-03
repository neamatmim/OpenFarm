import { startOfFarmDay } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatDigits } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";

import { StatusBadge } from "@/components/page";
import type {
  BankRateSaid,
  Returned,
  Running,
  Season,
} from "@/components/returns/return-figure";
import {
  SAID,
  isLoss,
  todayRangeSaid,
  wordFor,
} from "@/components/returns/return-figure";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";

/** What every hundred taka made, the days it was out, and that scaled to a year: all a return line says. */
type Shares = Pick<Returned, "per100" | "averageDays" | "perYear">;

/** What a Season is called: its Eid's year, or its window's dates. */
export const useSeasonName = () => {
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
      className={cn("tabular-nums", isLoss(per100) && "text-danger", className)}
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
export const Working = ({ returned }: { returned: Returned }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <details className="text-muted-foreground text-sm">
      <summary className="cursor-pointer underline-offset-4 select-none hover:underline">
        {t("returns.working")}
      </summary>
      <p className="mt-1 max-w-prose">
        {t("returns.workingText", {
          cost: taka(returned.costMoney),
          back: taka(returned.backMoney),
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
export const Result = ({ amount }: { amount: number }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <span className={cn("tabular-nums", isLoss(amount) && "text-danger")}>
      {t(wordFor(SAID.result, amount), { amount: taka(Math.abs(amount)) })}
    </span>
  );
};

/** What every hundred taka of cost made, small under a closed row's result: the loss's colour for a loss. */
export const ShareUnder = ({ per100 }: { per100: number }) => {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        isLoss(per100) ? "text-danger" : "text-muted-foreground"
      )}
    >
      {t(wordFor(SAID.onCost, per100), { amount: Math.abs(per100) })}
    </span>
  );
};

/**
 * How far a settled Venture's cattle now stand from the profit its Settlement was approved on, where a cost or a
 * Correction came after it — said as less or more, never with a bare sign. Nothing where the two still agree, or on an
 * answer this phone kept from before it was said.
 */
export const SinceSettlement = ({
  amount,
}: {
  amount: number | null | undefined;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  if (amount === null || amount === undefined) {
    return null;
  }
  return (
    <p className="text-warning text-sm tabular-nums">
      {t(wordFor(SAID.sinceSettlement, amount), {
        amount: taka(Math.abs(amount)),
      })}
    </p>
  );
};

export const LEFT_WORD = {
  sold: "returns.left.sold",
  died: "returns.left.died",
  lost: "returns.left.lost",
  sold_to_venture: "returns.left.sold_to_venture",
  crossed: "returns.left.crossed",
} as const satisfies Record<string, MessageKey>;

export const JOINED_WORD = {
  crossed: "returns.joined.crossed",
  bought_from_venture: "returns.joined.bought_from_venture",
} as const satisfies Record<string, MessageKey>;

export const CAME_WORD = {
  intake: "returns.came.intake",
  crossed: "returns.came.crossed",
  bought_from_venture: "returns.came.bought_from_venture",
} as const satisfies Record<string, MessageKey>;

/** The range at today's price, said as made, lost, or from lost to made — never a bare minus sign. */
export const TodayRange = ({ running }: { running: Running }) => {
  const { t } = useLanguage();
  const said = todayRangeSaid(running);
  return <>{t(said.key, said.params)}</>;
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
      {running.soldCostMoney === 0 ? null : (
        <p className="text-muted-foreground text-sm tabular-nums">
          {t(wordFor(SAID.gone, running.soldResultMoney), {
            amount: taka(Math.abs(running.soldResultMoney)),
          })}
        </p>
      )}
      <p className="text-muted-foreground text-sm tabular-nums">
        {t("returns.standingWorth", {
          cost: taka(running.standingCostMoney),
          low: taka(running.standingLowMoney),
          high: taka(running.standingHighMoney),
        })}
      </p>
      <p className="text-muted-foreground text-xs tabular-nums">
        {t("returns.daysSoFar", { days: running.low.averageDays })}
      </p>
    </div>
  );
};

import { formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";

import type { TheirAgreements } from "@/components/investors/investor-agreements";
import { portfolioOf } from "@/components/investors/investor-agreements";
import { Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";

/** The colours the allocation is drawn in, from the design tokens, in the order the Ventures are listed. Each is
 *  named in words beside it too, so nothing rests on telling two colours apart. */
const SWATCHES = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
] as const;

/** A percentage of a whole, to one place, for a share nobody should have to work out. */
const PERCENT_SCALE = 1000;
const shareOf = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * PERCENT_SCALE) / 10 : 0;

/** One figure of the account, in the grid beside the one that matters most: a label, a sum, and what it means. */
const Line = ({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning";
}) => (
  <div className="flex min-w-0 flex-col gap-1">
    <dt className="text-muted-foreground text-xs" data-slot="figure-label">
      {label}
    </dt>
    <dd
      className={cn(
        "text-xl font-semibold tabular-nums",
        tone === "warning" && "text-warning"
      )}
    >
      {value}
    </dd>
    {hint ? <dd className="text-muted-foreground text-xs">{hint}</dd> : null}
  </div>
);

/** The whole of a share, as the percent the bar is drawn to. */
const WHOLE = 100;

/**
 * How much of what their Units promised they have paid in: a bar and the two sums, the way a fund's investor is shown
 * called against committed. Nothing for somebody whose every Venture was called off, who promised nothing that stands.
 */
const PaidIn = ({
  paidInBdt,
  promisedBdt,
  returnedBdt,
}: {
  paidInBdt: number;
  promisedBdt: number;
  returnedBdt: number;
}) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  if (promisedBdt <= 0) {
    return null;
  }
  const share = Math.min(WHOLE, (paidInBdt / promisedBdt) * WHOLE);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        aria-hidden
        className="bg-muted h-1.5 w-full max-w-sm overflow-hidden rounded-full"
      >
        <span
          className="bg-primary block h-full rounded-full"
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="text-muted-foreground text-sm">
        {t("portal.sums.paidInOf", {
          paid: taka(paidInBdt),
          promised: taka(promisedBdt),
          percent: formatNumber(Math.round(share), language),
        })}
        {returnedBdt > 0
          ? ` · ${t("portal.sums.returned", { bdt: taka(returnedBdt) })}`
          : ""}
      </p>
    </div>
  );
};

/**
 * Their capital account, the first thing on the page — the way a fund's investor is shown committed, called and
 * distributed: the one figure that matters most, the capital the Farm holds of theirs now, set large, with how much of
 * what they promised they have paid in under it; and beside it what was paid out to them, their share of the profit,
 * the Units they hold and the Ventures they are in. Counted, never forecast.
 */
export const CapitalAccount = ({ theirs }: { theirs: TheirAgreements }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const sums = portfolioOf(theirs);
  const standing = theirs.agreements.filter(
    (one) => one.venture.state !== "cancelled"
  );
  const running = standing.filter(
    (one) => one.venture.state !== "settled"
  ).length;
  const units = standing.reduce((sum, one) => sum + one.units, 0);
  return (
    <section
      aria-labelledby="capital-account-title"
      className="surface grid gap-6 p-5 md:p-6 lg:grid-cols-2 lg:gap-8"
    >
      <div className="flex min-w-0 flex-col justify-center gap-3">
        <div className="flex flex-col gap-1">
          <h2
            className="text-muted-foreground text-sm font-medium"
            id="capital-account-title"
          >
            {t("portal.heldNow")}
          </h2>
          <p className="text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
            {taka(sums.heldBdt)}
          </p>
        </div>
        <PaidIn
          paidInBdt={sums.paidInBdt}
          promisedBdt={sums.promisedBdt}
          returnedBdt={sums.returnedBdt}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5 lg:border-s lg:border-t-0 lg:ps-8 lg:pt-0">
        <Line label={t("portal.paidOut")} value={taka(sums.paidOutBdt)} />
        <Line
          hint={
            sums.settled
              ? t("investors.page.fromSettled", { count: sums.settled })
              : t("investors.page.noneSettled")
          }
          label={t("portal.profit")}
          tone={sums.profitBdt < 0 ? "warning" : "neutral"}
          value={taka(sums.profitBdt)}
        />
        <Line
          label={t("investors.unitsHeld")}
          value={formatNumber(units, language)}
        />
        <Line
          hint={t("portal.sums.settledCount", { count: sums.settled })}
          label={t("portal.sums.running")}
          value={formatNumber(running, language)}
        />
      </dl>
    </section>
  );
};

/**
 * Where the capital held now sits, by Venture: one bar split in the Ventures' shares, and each named with its taka
 * and its percent beneath — the bar for the eye, the words for anybody who cannot tell the colours apart. Drawn only
 * once there are two to compare.
 */
export const Allocation = ({ theirs }: { theirs: TheirAgreements }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const holding = theirs.agreements.filter(
    (one) => one.capitalHeldBdt > 0 && !one.settlement?.paidOn
  );
  const whole = holding.reduce((sum, one) => sum + one.capitalHeldBdt, 0);
  if (holding.length < 2 || whole <= 0) {
    return null;
  }
  return (
    <Section
      description={t("portal.allocationHint")}
      title={t("portal.allocation")}
    >
      <div
        aria-hidden
        className="bg-muted flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
      >
        {holding.map((one, at) => (
          <span
            className={cn("h-full", SWATCHES[at % SWATCHES.length])}
            key={one.id}
            style={{ width: `${shareOf(one.capitalHeldBdt, whole)}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-col divide-y">
        {holding.map((one, at) => (
          <li className="flex items-center gap-3 py-2 text-sm" key={one.id}>
            <span
              aria-hidden
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                SWATCHES[at % SWATCHES.length]
              )}
            />
            <span className="min-w-0 flex-1 truncate">{one.venture.name}</span>
            <span className="font-medium tabular-nums">
              {taka(one.capitalHeldBdt)}
            </span>
            <span className="text-muted-foreground w-14 text-end tabular-nums">
              {t("portal.percent", {
                percent: formatNumber(
                  shareOf(one.capitalHeldBdt, whole),
                  language
                ),
              })}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
};

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

/** One line of the account beside the one figure: a label, a sum, and what it means. */
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
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-muted-foreground text-xs" data-slot="figure-label">
      {label}
    </dt>
    <dd
      className={cn(
        "text-base font-semibold tabular-nums",
        tone === "warning" && "text-warning"
      )}
    >
      {value}
    </dd>
    {hint ? <dd className="text-muted-foreground text-xs">{hint}</dd> : null}
  </div>
);

/**
 * Their capital account, the first thing on the page — the way a fund's investor is shown committed, called and
 * distributed: the one figure that matters most, the capital the Farm holds of theirs now, set large; and beside it
 * what their Units promised, what they paid in, what came back to them, and their share of the profit. Counted, never
 * forecast.
 */
export const CapitalAccount = ({ theirs }: { theirs: TheirAgreements }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const sums = portfolioOf(theirs);
  const running = theirs.agreements.filter(
    (one) =>
      one.venture.state !== "settled" && one.venture.state !== "cancelled"
  ).length;
  return (
    <section
      aria-labelledby="capital-account-title"
      className="surface grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2
          className="text-muted-foreground text-sm font-medium"
          id="capital-account-title"
        >
          {t("portal.heldNow")}
        </h2>
        <p className="text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
          {taka(sums.heldBdt)}
        </p>
        <p className="text-muted-foreground text-sm">
          {t("portal.sums.heldIn", { count: running })}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-4 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
        <Line
          hint={t("portal.sums.promisedHint")}
          label={t("portal.sums.promised")}
          value={taka(sums.promisedBdt)}
        />
        <Line
          hint={
            sums.returnedBdt > 0
              ? t("portal.sums.returned", { bdt: taka(sums.returnedBdt) })
              : undefined
          }
          label={t("portal.sums.paidIn")}
          value={taka(sums.paidInBdt)}
        />
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

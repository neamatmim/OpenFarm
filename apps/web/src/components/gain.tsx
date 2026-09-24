import type { FatteningView, GainBasis } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";

import { Nothing } from "@/components/list-cells";
import { ProgressBar } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/**
 * One of the two rates, and where it lands her.
 *
 * Shown beside the other rather than instead of it (the Owner's decision, 2026-09-12): a bull
 * who gained well all winter and nothing this fortnight reads as fine on his lifetime average,
 * and the gap between the two columns is the farm's signal that a ration has stopped working.
 */
export const GainColumn = ({
  label,
  basis,
}: {
  label: string;
  basis: GainBasis | null;
}) => {
  const { t, language } = useLanguage();
  if (!basis) {
    return (
      <div className="bg-muted/40 flex flex-col gap-1 rounded-lg border p-3">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-muted-foreground text-sm">{t("gain.needsTwo")}</p>
      </div>
    );
  }
  return (
    <div className="bg-muted/40 flex flex-col gap-1 rounded-lg border p-3">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-lg font-semibold tabular-nums">
        {t("gain.perDay", { kg: formatNumber(basis.dailyGainKg, language) })}
      </p>
      <p className="text-muted-foreground text-sm">
        {t("correct.spanDays", {
          days: formatNumber(basis.overDays, language),
        })}
      </p>
      {basis.projectedKg === null ? null : (
        <p
          className={
            basis.reachesTarget
              ? "text-success text-sm"
              : "text-warning text-sm"
          }
        >
          {t("gain.projected", {
            kg: formatNumber(basis.projectedKg, language),
          })}
        </p>
      )}
    </div>
  );
};

/** The same rate as a cell of a table: the rate, the days it was measured over, and where it lands her — a dash
 *  where there is no rate yet, since the column's heading already says which rate this is. */
export const GainFigures = ({ basis }: { basis: GainBasis | null }) => {
  const { t, language } = useLanguage();
  if (!basis) {
    return <Nothing />;
  }
  return (
    <div className="flex flex-col gap-0.5 whitespace-nowrap">
      <span className="font-medium">
        {t("gain.perDay", { kg: formatNumber(basis.dailyGainKg, language) })}
      </span>
      <span className="text-muted-foreground text-xs">
        {t("correct.spanDays", {
          days: formatNumber(basis.overDays, language),
        })}
      </span>
      {basis.projectedKg === null ? null : (
        <span
          className={
            basis.reachesTarget
              ? "text-success text-xs"
              : "text-warning text-xs"
          }
        >
          {t("gain.projected", {
            kg: formatNumber(basis.projectedKg, language),
          })}
        </span>
      )}
    </div>
  );
};

/** What she weighs now as a cell of a table, with her target weight under it — and, with `bar`, how far she has come
 *  towards it. One column rather than two, so a row of her figures still fits beside her two rates. */
export const WeightAgainstTarget = ({
  latestKg,
  targetWeightKg,
  bar = false,
}: {
  latestKg: number | null;
  targetWeightKg: number | null;
  bar?: boolean;
}) => {
  const { t, language } = useLanguage();
  const kg = (value: number) =>
    t("intake.kg", { kg: formatNumber(value, language) });
  const towards =
    bar && latestKg !== null && targetWeightKg !== null
      ? (latestKg / targetWeightKg) * 100
      : null;
  return (
    <div className="flex flex-col gap-1 whitespace-nowrap">
      <span
        className={latestKg === null ? "text-muted-foreground" : "font-medium"}
      >
        {latestKg === null ? "—" : kg(latestKg)}
      </span>
      {targetWeightKg === null ? null : (
        <span className="text-muted-foreground text-xs">
          {t("intake.targetWeight")}: {kg(targetWeightKg)}
        </span>
      )}
      {towards === null ? null : (
        <ProgressBar
          className="h-1.5"
          label={`${t("gain.now")} / ${t("intake.targetWeight")}`}
          value={towards}
        />
      )}
    </div>
  );
};

/** Her gain and both projections, side by side against what she is being fed towards. */
export const TwoProjections = ({ view }: { view: FatteningView }) => {
  const { t, language } = useLanguage();
  return (
    <section className="surface space-y-2 p-4 md:p-5">
      <h2 className="text-base font-semibold tracking-tight">
        {t("gain.title")}
      </h2>
      <p className="text-muted-foreground text-sm">
        {/* Each of these is left out rather than shown blank: an animal born here has no
            arrival to count days from and nobody has said what it is being fed towards. */}
        {view.daysOnFeed === null
          ? null
          : `${t("gain.daysOnFeed")}: ${t("correct.spanDays", {
              days: formatNumber(view.daysOnFeed, language),
            })} · `}
        {view.latestKg === null
          ? t("gain.noneYet")
          : `${t("gain.now")}: ${t("intake.kg", {
              kg: formatNumber(view.latestKg, language),
            })}`}
        {view.targetWeightKg === null
          ? null
          : ` · ${t("intake.targetWeight")}: ${t("intake.kg", {
              kg: formatNumber(view.targetWeightKg, language),
            })}`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <GainColumn basis={view.sinceIntake} label={t("gain.sinceIntake")} />
        <GainColumn basis={view.recent} label={t("gain.recent")} />
      </div>
    </section>
  );
};

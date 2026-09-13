import type { FatteningView, GainBasis } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";

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
      <div className="surface space-y-1 p-4">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-muted-foreground text-sm">{t("gain.needsTwo")}</p>
      </div>
    );
  }
  return (
    <div className="surface space-y-1 p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-lg font-medium">
        {t("gain.perDay", { kg: formatNumber(basis.dailyGainKg, language) })}
      </p>
      <p className="text-muted-foreground text-xs">
        {t("correct.spanDays", {
          days: formatNumber(basis.overDays, language),
        })}
      </p>
      {basis.projectedKg === null ? null : (
        <p className={basis.reachesTarget ? "text-success" : "text-warning"}>
          {t("gain.projected", {
            kg: formatNumber(basis.projectedKg, language),
          })}
        </p>
      )}
    </div>
  );
};

/** Her gain and both projections, side by side against what she is being fed towards. */
export const TwoProjections = ({ view }: { view: FatteningView }) => {
  const { t, language } = useLanguage();
  return (
    <section className="surface space-y-2 p-4">
      <h2 className="text-lg font-semibold">{t("gain.title")}</h2>
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

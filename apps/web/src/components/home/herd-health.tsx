import { formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";

import { Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** One figure, labeled, with what it is made of beneath. */
const Figure = ({
  label,
  value,
  under,
}: {
  label: string;
  value: string;
  under?: string;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="text-lg font-semibold tabular-nums sm:text-xl">{value}</dd>
    {under ? <dd className="text-muted-foreground text-xs">{under}</dd> : null}
  </div>
);

/**
 * The dairy herd's year beside its deaths: every way a cow left the milking herd and the heifers that joined it, over
 * the cows kept; and how often the farm's animals were found sick, mastitis over the cows. Nothing on a farm that kept no
 * cow and diagnosed nothing.
 */
export const HerdHealthSection = () => {
  const { t, language } = useLanguage();
  const health = useQuery(orpc.animals.herdHealth.queryOptions());
  const figure = health.data;
  if (
    !figure ||
    (figure.turnover.cowYears === 0 && figure.sickness.diseases.length === 0)
  ) {
    return null;
  }
  const { turnover, sickness } = figure;
  const n = (value: number) => formatNumber(value, language);
  const rate = (value: number | null) =>
    value === null
      ? t("deaths.noneKept")
      : t("deaths.rate", { rate: n(value) });
  return (
    <Section description={t("herd.healthHint")} title={t("herd.healthTitle")}>
      <dl className="grid grid-cols-2 gap-4">
        <Figure
          label={t("herd.leftTheHerd")}
          under={t("herd.leftCounts", {
            died: n(turnover.died),
            culled: n(turnover.culled),
            sold: n(turnover.sold),
            crossed: n(turnover.crossed),
            lost: n(turnover.lost),
          })}
          value={rate(turnover.leftPerHundred)}
        />
        <Figure
          label={t("herd.joinedTheHerd")}
          under={t("herd.joinedCount", { count: n(turnover.replacements) })}
          value={rate(turnover.replacementsPerHundred)}
        />
        <Figure
          label={t("herd.sickDairy")}
          value={rate(sickness.dairyPerHundred)}
        />
        <Figure
          label={t("herd.mastitis")}
          value={rate(sickness.mastitisPerHundredCows)}
        />
      </dl>
      {sickness.diseases.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("herd.diseases", {
            diseases: sickness.diseases
              .slice(0, 6)
              .map((one) => `${one.disease} (${n(one.count)})`)
              .join(", "),
          })}
        </p>
      ) : null}
    </Section>
  );
};

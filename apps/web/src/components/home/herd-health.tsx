import { formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";

import { Section } from "@/components/page";
import { FigureTerm } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

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
        <FigureTerm
          hint={t("herd.leftCounts", {
            died: n(turnover.died),
            culled: n(turnover.culled),
            sold: n(turnover.sold),
            crossed: n(turnover.crossed),
            lost: n(turnover.lost),
          })}
          label={t("herd.leftTheHerd")}
          size="panel"
        >
          {rate(turnover.leftPerHundred)}
        </FigureTerm>
        <FigureTerm
          hint={t("herd.joinedCount", { count: n(turnover.replacements) })}
          label={t("herd.joinedTheHerd")}
          size="panel"
        >
          {rate(turnover.replacementsPerHundred)}
        </FigureTerm>
        <FigureTerm label={t("herd.sickDairy")} size="panel">
          {rate(sickness.dairyPerHundred)}
        </FigureTerm>
        <FigureTerm label={t("herd.mastitis")} size="panel">
          {rate(sickness.mastitisPerHundredCows)}
        </FigureTerm>
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

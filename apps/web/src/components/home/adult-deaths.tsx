import type { SideDeaths } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";

import { Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** One Side's year: deaths for every hundred head kept, and how many died and were culled beneath. */
const SideFigure = ({ label, side }: { label: string; side: SideDeaths }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums sm:text-xl">
        {side.perHundred === null
          ? t("deaths.noneKept")
          : t("deaths.rate", { rate: formatNumber(side.perHundred, language) })}
      </dd>
      <dd className="text-muted-foreground text-xs">
        {t("deaths.counts", { died: side.died, culled: side.culled })}
      </dd>
    </div>
  );
};

/**
 * What the farm lost in grown animals over the last year, beside what it lost in calves: deaths for every hundred head
 * kept a year on each Side, culls counted apart, and what the dead died of. Nothing on a farm that kept no grown animal.
 */
export const AdultDeathsSection = () => {
  const { t, language } = useLanguage();
  const deaths = useQuery(orpc.animals.deaths.queryOptions());
  const figure = deaths.data;
  const keptAny =
    figure !== undefined &&
    (figure.dairy.perHundred !== null || figure.fattening.perHundred !== null);
  if (!(figure && keptAny)) {
    return null;
  }
  return (
    <Section description={t("deaths.hint")} title={t("deaths.title")}>
      <dl className="grid grid-cols-2 gap-4">
        <SideFigure label={t("deaths.dairy")} side={figure.dairy} />
        <SideFigure label={t("deaths.fattening")} side={figure.fattening} />
      </dl>
      {figure.causes.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("deaths.causes", {
            causes: figure.causes
              .map(
                (one) => `${one.cause} (${formatNumber(one.count, language)})`
              )
              .join(", "),
          })}
        </p>
      ) : null}
    </Section>
  );
};

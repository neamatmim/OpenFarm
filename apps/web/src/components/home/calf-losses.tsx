import { formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";

import { Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** More than one in ten lost before weaning is too many (DLS NG-GLPP §11.5(a)). */
const TOO_MANY_LOST = 0.1;

/** One figure of the three, labelled. */
const Figure = ({
  label,
  value,
  loud = false,
}: {
  label: string;
  value: string;
  loud?: boolean;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd
      className={cn(
        "text-lg font-semibold tracking-tight tabular-nums sm:text-xl",
        loud && "text-danger"
      )}
    >
      {value}
    </dd>
  </div>
);

/**
 * What the farm lost in calves over the last year — the figure that says whether its calf care works: born alive, born
 * dead, and lost before weaning, loud when more than one in ten, with what they died of. Nothing at all on a farm that
 * has recorded no calving in the year.
 */
export const CalfLossesSection = () => {
  const { t, language } = useLanguage();
  const losses = useQuery(orpc.animals.calfLosses.queryOptions());
  const figure = losses.data;
  if (!figure || figure.bornAlive + figure.stillborn === 0) {
    return null;
  }
  const share = figure.lostShare ?? 0;
  const tooMany = share > TOO_MANY_LOST;
  return (
    <Section description={t("calves.hint")} title={t("calves.title")}>
      <dl className="grid grid-cols-3 gap-4">
        <Figure
          label={t("calves.bornAlive")}
          value={formatNumber(figure.bornAlive, language)}
        />
        <Figure
          label={t("calves.stillborn")}
          value={formatNumber(figure.stillborn, language)}
        />
        <Figure
          label={t("calves.lost")}
          loud={tooMany}
          value={formatNumber(figure.diedBeforeWeaning, language)}
        />
      </dl>
      {figure.lostShare === null ? null : (
        <p
          className={cn(
            "text-sm",
            tooMany ? "text-danger" : "text-muted-foreground"
          )}
        >
          {t("calves.lostShare", {
            share: formatNumber(Math.round(share * 100), language),
          })}
        </p>
      )}
      {figure.causes.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("calves.causes", {
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

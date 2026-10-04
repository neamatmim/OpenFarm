import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Droplets, Milk, TrendingUp } from "lucide-react";

import type { AnimalDetail } from "@/components/animal/animal-types";
import { Section } from "@/components/page";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/**
 * What a cow has given in the Lactation she is in, a farm day at a time: in all, a day on average, lately, and her best
 * day. Nothing for an animal that has never calved, or a Lactation nobody has milked her in yet.
 */
export const HerLactation = ({ detail }: { detail: AnimalDetail }) => {
  const { t, language } = useLanguage();
  const inOne = detail.side === "dairy" && detail.lactationNumber > 0;
  const hers = useQuery({
    ...orpc.milk.forAnimal.queryOptions({
      input: { tagNumber: detail.tagNumber },
    }),
    enabled: inOne,
  });
  // A phone's copy of her milk from before it said a summary has none.
  const summary = hers.data?.summary;
  if (!inOne || !summary || summary.daysMilked === 0) {
    return null;
  }
  const litres = (value: number | null) =>
    value === null
      ? "—"
      : t("owner.litres", { litres: formatNumber(value, language) });
  return (
    <Section
      description={t("milk.herLactationHint", {
        days: formatNumber(summary.daysMilked, language),
      })}
      title={t("calving.lactation", {
        number: formatNumber(detail.lactationNumber, language),
      })}
    >
      <SummaryFigures
        figures={[
          {
            label: t("milk.inAll"),
            value: litres(summary.litres),
            icon: Milk,
            tone: "neutral",
          },
          {
            label: t("milk.perDay"),
            value: litres(summary.perDay),
            icon: Droplets,
            tone: "neutral",
          },
          {
            label: t("milk.lately"),
            value: litres(summary.latelyPerDay),
            icon: TrendingUp,
            tone: "neutral",
          },
          {
            label: t("milk.bestDay"),
            value: litres(summary.peak?.litres ?? null),
            hint: summary.peak
              ? formatDate(
                  new Date(`${summary.peak.day}T12:00:00Z`),
                  language,
                  "date"
                )
              : undefined,
            icon: CalendarDays,
            tone: "neutral",
          },
        ]}
      />
    </Section>
  );
};

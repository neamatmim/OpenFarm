import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Droplets, Milk, TrendingUp } from "lucide-react";

import type { AnimalDetail } from "@/components/animal/animal-types";
import { Section, StatusBadge } from "@/components/page";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Lactation = Awaited<
  ReturnType<typeof client.milk.forAnimal>
>["lactations"][number];

/** One Lactation of hers: when it began and ended, how long she milked, and how long she then stood dry. */
const LactationLine = ({ lactation }: { lactation: Lactation }) => {
  const { t, language } = useLanguage();
  const days = (count: number) => formatNumber(count, language);
  const ended =
    lactation.driedAt === null
      ? null
      : t("milk.driedOn", {
          date: formatDate(new Date(lactation.driedAt), language, "date"),
        });
  const dry =
    lactation.dryDays === null
      ? null
      : t(lactation.stillDry ? "milk.daysDrySoFar" : "milk.daysDry", {
          days: days(lactation.dryDays),
        });
  return (
    <li className="flex flex-col gap-1 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="font-medium">
        {t("calving.lactation", {
          number: formatNumber(lactation.lactationNumber, language),
        })}
      </span>
      <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {lactation.startedAt === null ? null : (
          <span>
            {t("milk.calvedOn", {
              date: formatDate(new Date(lactation.startedAt), language, "date"),
            })}
          </span>
        )}
        <span>{ended ?? t("milk.dryOffUnknown")}</span>
        {lactation.lactationDays === null ? null : (
          <span>
            {t("milk.daysInMilkOf", { days: days(lactation.lactationDays) })}
          </span>
        )}
        {dry === null ? null : (
          <StatusBadge tone={lactation.stillDry ? "info" : "neutral"}>
            {dry}
          </StatusBadge>
        )}
      </span>
    </li>
  );
};

/**
 * Every Lactation the farm knows of hers, latest first — said only once there is more than the one she is in to say,
 * or she has been dried off from it. The one she is still milking says so.
 */
const HerLactations = ({ lactations }: { lactations: Lactation[] }) => {
  const { t } = useLanguage();
  const [latest] = lactations;
  const somethingToSay =
    lactations.length > 1 || (latest !== undefined && latest.driedAt !== null);
  if (!somethingToSay) {
    return null;
  }
  return (
    <Section
      description={t("milk.herLactationsHint")}
      title={t("milk.herLactations")}
    >
      <ul className="divide-border flex flex-col divide-y">
        {lactations.map((lactation) => (
          <LactationLine
            key={lactation.lactationNumber}
            lactation={lactation}
          />
        ))}
      </ul>
    </Section>
  );
};

/**
 * What a cow has given in the Lactation she is in, a farm day at a time: in all, a day on average, lately, and her best
 * day — nothing for one nobody has milked her in yet — and her Lactations before it. Nothing at all for an animal that
 * has never calved.
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
  // A phone's copy of her milk from before it said a summary, or her Lactations, has none.
  const summary = hers.data?.summary;
  const lactations = hers.data?.lactations ?? [];
  if (!inOne) {
    return null;
  }
  if (!summary || summary.daysMilked === 0) {
    return <HerLactations lactations={lactations} />;
  }
  const litres = (value: number | null) =>
    value === null
      ? "—"
      : t("owner.litres", { litres: formatNumber(value, language) });
  return (
    <>
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
      <HerLactations lactations={lactations} />
    </>
  );
};

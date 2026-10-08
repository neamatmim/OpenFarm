import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";

import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** One figure of the week's milk, in liters. */
const Line = ({
  label,
  liters,
  loud = false,
}: {
  label: string;
  liters: number;
  loud?: boolean;
}) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", loud && "text-danger font-semibold")}>
        {t("units.liters", { liters: formatNumber(liters, language) })}
      </span>
    </div>
  );
};

/**
 * The week's milk: what went into the tank, what left the gate, what is still in the tank, and what nobody can account
 * for — in red when it is past the Owner's line — and beside it what the calves drank. Above the day's Dispatches,
 * because a day on its own cannot say where the milk went: an evening's milk leaves the next morning.
 */
export const MilkAccountCard = () => {
  const { t, language } = useLanguage();
  const account = useQuery(orpc.milk.account.queryOptions());
  if (!account.data) {
    return null;
  }
  const week = account.data;
  const calvesDrank = week.calves.litersADay > 0;
  const pastTheLine =
    week.notAccounted > 0 && week.notAccountedPercent > week.linePercent;
  return (
    <section className="surface flex flex-col p-4 md:p-5">
      <h3 className="text-base font-semibold">{t("milkAccount.title")}</h3>
      <p className="text-muted-foreground pb-2 text-xs">
        {t("milkAccount.hint", {
          since: formatDate(startOfFarmDay(week.since), language, "date"),
        })}
      </p>
      {week.carriedIn > 0 ? (
        <Line label={t("milkAccount.carriedIn")} liters={week.carriedIn} />
      ) : null}
      <Line label={t("milkAccount.toBulk")} liters={week.toBulk} />
      <Line label={t("milkAccount.dispatched")} liters={week.dispatched} />
      <Line label={t("milkAccount.stillInTank")} liters={week.stillInTank} />
      <Line
        label={`${t("milkAccount.notAccounted")} (${formatNumber(week.notAccountedPercent, language)}%)`}
        liters={week.notAccounted}
        loud={pastTheLine}
      />
      {/* Only when the calves drank from the pail this week: none recorded is not calves going hungry. */}
      {calvesDrank && week.calves.perCalf !== null ? (
        <p className="text-muted-foreground pt-2 text-xs">
          {t("milkAccount.calves", {
            liters: formatNumber(week.calves.litersADay, language),
            calves: week.calves.calves,
            perCalf: formatNumber(week.calves.perCalf, language),
          })}
        </p>
      ) : null}
    </section>
  );
};

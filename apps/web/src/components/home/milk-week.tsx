import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";

import { useLanguage } from "@/i18n/language-provider";

const WEEK = 7;
const HOUR_MS = 60 * 60 * 1000;

/** The seven farm days ending today, oldest first — the slots the week is drawn in, whether or not milk came. */
const weekEndingToday = (now: Date): string[] =>
  Array.from({ length: WEEK }, (_, index) =>
    farmDayOf(new Date(now.getTime() - (WEEK - 1 - index) * 24 * HOUR_MS))
  );

/** The week behind today, oldest on the left: a day is read against the week around it.
 *  Each bar is one day of the farm's milk — every Pen's Sessions added together, which is
 *  what somebody means when they ask what yesterday came to — with its litres above it, and
 *  the week's average drawn across as a dashed line. Today is the darker bar, and may be
 *  half a day yet. A day with nothing recorded is an outline, not a bar: no record is not
 *  the same as no milk. */
export const MilkWeek = ({
  days,
  average,
}: {
  days: { day: string; litres: number }[];
  average?: number;
}) => {
  const { t, language } = useLanguage();
  const litresOn = new Map(days.map((one) => [one.day, one.litres]));
  const slots = weekEndingToday(new Date()).map((day) => ({
    day,
    litres: litresOn.get(day),
  }));
  const today = slots.at(-1)?.day;
  const most = Math.max(...days.map((one) => one.litres), average ?? 0, 1);
  return (
    <ol className="grid grid-cols-7 items-end gap-1.5">
      {slots.map(({ day, litres }) => {
        const when = formatDate(
          new Date(`${day}T12:00:00+06:00`),
          language,
          "date"
        );
        const said =
          litres === undefined
            ? `${when}: ${t("owner.noRecord")}`
            : `${when}: ${t("owner.litres", { litres: formatNumber(litres, language) })}`;
        const isToday = day === today;
        return (
          <li
            className="flex min-w-0 flex-col items-center gap-1"
            key={day}
            title={said}
          >
            <span className="sr-only">{said}</span>
            <span
              aria-hidden
              className={cn(
                "text-muted-foreground truncate text-xs tabular-nums",
                isToday && "text-foreground font-semibold"
              )}
            >
              {litres === undefined
                ? "—"
                : formatNumber(Math.round(litres), language)}
            </span>
            <span aria-hidden className="relative flex h-28 w-full items-end">
              {litres === undefined ? (
                <span className="border-border h-full w-full rounded-sm border border-dashed" />
              ) : (
                <span
                  className={cn(
                    "w-full rounded-sm",
                    isToday ? "bg-primary" : "bg-primary/45"
                  )}
                  style={{
                    height:
                      litres === 0
                        ? "2px"
                        : `${Math.max((litres / most) * 100, 6)}%`,
                  }}
                />
              )}
              {average ? (
                <span
                  className="border-foreground/50 absolute -inset-x-[3px] border-t border-dashed"
                  style={{ bottom: `${(average / most) * 100}%` }}
                />
              ) : null}
            </span>
            <span
              aria-hidden
              className={cn(
                "text-muted-foreground text-xs tabular-nums",
                isToday && "text-primary font-semibold"
              )}
            >
              {isToday
                ? t("owner.todayMark")
                : formatNumber(Number(day.slice(8)), language)}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

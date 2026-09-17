import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

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
 *  what somebody means when they ask what yesterday came to. A day with nothing recorded is
 *  an outline, not a bar: no record is not the same as no milk. */
export const MilkWeek = ({
  days,
}: {
  days: { day: string; litres: number }[];
}) => {
  const { t, language } = useLanguage();
  const litresOn = new Map(days.map((one) => [one.day, one.litres]));
  const slots = weekEndingToday(new Date()).map((day) => ({
    day,
    litres: litresOn.get(day),
  }));
  const most = Math.max(...days.map((one) => one.litres), 1);
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
        return (
          <li
            className="flex flex-col items-center gap-1"
            key={day}
            title={said}
          >
            <span className="sr-only">{said}</span>
            <span aria-hidden className="flex h-28 w-full items-end">
              {litres === undefined ? (
                <span className="border-border h-full w-full rounded-sm border border-dashed" />
              ) : (
                <span
                  className="bg-primary/70 w-full rounded-sm"
                  style={{
                    height:
                      litres === 0
                        ? "2px"
                        : `${Math.max((litres / most) * 100, 6)}%`,
                  }}
                />
              )}
            </span>
            <span
              aria-hidden
              className="text-muted-foreground text-xs tabular-nums"
            >
              {formatNumber(Number(day.slice(8)), language)}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import { useLanguage } from "@/i18n/language-provider";

/** The herd's average weight as the farm knew it on one day, as the server says it. */
export interface HerdWeight {
  day: string;
  averageKg: number;
  animals: number;
}

/** Room between the highest and lowest point and the chart's edges, in kilogrammes, and the step the edges round to. */
const HEADROOM_KG = 5;
const EDGE_STEP_KG = 10;

/** The plot is drawn in a 100 by 100 box stretched to the chart's size, with a little room so no point is cut. */
const VIEW_BOX = "-2 -6 104 112";

/**
 * The herd's average weight on each day the farm weighed, as a line — drawn only over those days, never on past the
 * last or up to a target, since either would read as a forecast. The sentence above it says where it starts and
 * ends, and the figures under it are the same line as a table, for a reader who cannot see the line.
 *
 * Drawn by hand rather than with a charting library: it is one line, and the portal's other bars are drawn the same
 * way.
 */
export const WeightLine = ({ weights }: { weights: HerdWeight[] }) => {
  const { t, language } = useLanguage();
  const first = weights.at(0);
  const last = weights.at(-1);
  // One day is a point, not a line; the averages above already say it.
  if (!first || !last || weights.length < 2) {
    return null;
  }
  const kg = (value: number) =>
    t("portal.kg", { kg: formatNumber(value, language) });
  const day = (value: string) => formatDate(startOfFarmDay(value), language);

  const heaviest = Math.max(...weights.map((one) => one.averageKg));
  const lightest = Math.min(...weights.map((one) => one.averageKg));
  const top = Math.ceil((heaviest + HEADROOM_KG) / EDGE_STEP_KG) * EDGE_STEP_KG;
  const bottom = Math.max(
    0,
    Math.floor((lightest - HEADROOM_KG) / EDGE_STEP_KG) * EDGE_STEP_KG
  );
  const from = startOfFarmDay(first.day).getTime();
  const span = startOfFarmDay(last.day).getTime() - from;
  const points = weights.map((one) => ({
    x: ((startOfFarmDay(one.day).getTime() - from) / span) * 100,
    y: 100 - ((one.averageKg - bottom) / (top - bottom)) * 100,
    one,
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">{t("portal.weightLine.title")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("portal.weightLine.summary", {
            from: kg(first.averageKg),
            fromDay: day(first.day),
            to: kg(last.averageKg),
            toDay: day(last.day),
          })}
        </p>
      </div>
      <div className="flex gap-2">
        <div
          aria-hidden
          className="text-muted-foreground flex shrink-0 flex-col justify-between py-1 text-end text-xs whitespace-nowrap tabular-nums"
        >
          <span>{kg(top)}</span>
          <span>{kg(bottom)}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <svg
            aria-hidden
            className="h-40 w-full overflow-visible"
            preserveAspectRatio="none"
            viewBox={VIEW_BOX}
          >
            {[0, 50, 100].map((y) => (
              <line
                className="stroke-border"
                key={y}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                x1={0}
                x2={100}
                y1={y}
                y2={y}
              />
            ))}
            <polyline
              className="stroke-chart-1"
              fill="none"
              points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
              strokeLinejoin="round"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            {/* A dot a day, drawn as a line of no length with a round end, so stretching the box keeps it round. */}
            {points.map(({ x, y, one }) => (
              <line
                className="stroke-chart-1"
                key={one.day}
                strokeLinecap="round"
                strokeWidth={7}
                vectorEffect="non-scaling-stroke"
                x1={x}
                x2={x}
                y1={y}
                y2={y}
              />
            ))}
          </svg>
          <div
            aria-hidden
            className="text-muted-foreground flex justify-between gap-2 text-xs"
          >
            <span>{day(first.day)}</span>
            <span>{day(last.day)}</span>
          </div>
        </div>
      </div>
      <details className="text-sm">
        <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer">
          {t("portal.weightLine.figures")}
        </summary>
        <table className="mt-2 w-full max-w-md text-sm">
          <thead className="text-muted-foreground border-b text-xs">
            <tr>
              <th className="py-1.5 text-start font-medium" scope="col">
                {t("portal.weightLine.day")}
              </th>
              <th className="py-1.5 text-end font-medium" scope="col">
                {t("portal.weightLine.animals")}
              </th>
              <th className="py-1.5 text-end font-medium" scope="col">
                {t("portal.weightLine.average")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {weights.map((one) => (
              <tr key={one.day}>
                <td className="py-1.5">{day(one.day)}</td>
                <td className="py-1.5 text-end tabular-nums">
                  {formatNumber(one.animals, language)}
                </td>
                <td className="py-1.5 text-end tabular-nums">
                  {kg(one.averageKg)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};

import { formatNumber } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";

import { ProgressBar } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/** How one Pen's day is going, and how many animals are standing in it. Its name opens that Pen's work. */
export const PenProgress = ({
  name,
  pen,
}: {
  name: string;
  pen: { penId: string; raised: number; done: number; animals: number };
}) => {
  const { t, language } = useLanguage();
  const percent =
    pen.raised === 0 ? 0 : Math.round((pen.done / pen.raised) * 100);
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          className="truncate font-medium hover:underline"
          search={{ pen: pen.penId }}
          to="/today"
        >
          {name}
        </Link>
        <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
          {t("home.progress", {
            done: formatNumber(pen.done, language),
            raised: formatNumber(pen.raised, language),
          })}
        </span>
      </div>
      <ProgressBar label={name} value={percent} />
      <span className="text-muted-foreground text-xs">
        {t("home.animalsIn", { count: formatNumber(pen.animals, language) })}
      </span>
    </div>
  );
};

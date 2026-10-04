import type { CheckSummary } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { AlarmClock, TriangleAlert } from "lucide-react";

import { StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/** The tank against what the cows gave, in words for which way it went, never a minus sign before a Bangla figure. */
const tankSaid = (
  milk: CheckSummary["milk"],
  count: (n: number) => string,
  t: ReturnType<typeof useLanguage>["t"]
): string | null => {
  if (!milk || milk.bulkLitres === null) {
    return null;
  }
  const litres = count(milk.bulkLitres);
  const difference = milk.differenceLitres ?? 0;
  if (difference === 0) {
    return t("signOff.line.tankEven", { litres });
  }
  return t(
    difference > 0 ? "signOff.line.tankOver" : "signOff.line.tankUnder",
    {
      litres,
      difference: count(Math.abs(difference)),
    }
  );
};

/**
 * What a piece of work came to, in a line under its name: done and passed as well, skipped, the tank against the cows, a
 * short feed, figures out of range — and in words with a mark, never colour alone, that it is late or the farm flagged it.
 * Nothing for a phone's copy of the queue from before it said.
 */
export const CheckLine = ({ check }: { check: CheckSummary | undefined }) => {
  const { t, language } = useLanguage();
  if (!check) {
    return null;
  }
  const count = (n: number) => formatNumber(n, language);
  const said = [
    t("work.tallyDone", { count: count(check.done) }),
    check.passedWell > 0
      ? t("signOff.line.passedWell", { count: count(check.passedWell) })
      : null,
    check.skipped > 0
      ? t("work.tallySkipped", { count: count(check.skipped) })
      : null,
    tankSaid(check.milk, count, t),
    check.shortFedPercent === null
      ? null
      : t("signOff.line.shortFed", { percent: count(check.shortFedPercent) }),
    check.outOfRange > 0
      ? t("signOff.line.outOfRange", { count: count(check.outOfRange) })
      : null,
  ].filter((part): part is string => part !== null);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="text-muted-foreground tabular-nums">
        {said.join(" · ")}
      </span>
      {check.late ? (
        <StatusBadge icon={AlarmClock} tone="warning">
          {t("work.overdue")}
        </StatusBadge>
      ) : null}
      {check.flagged ? (
        <StatusBadge icon={TriangleAlert} tone="danger">
          {t("signOff.line.flagged")}
        </StatusBadge>
      ) : null}
    </div>
  );
};

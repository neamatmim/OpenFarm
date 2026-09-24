import { startOfFarmDay } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Archive } from "lucide-react";

import { StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

// The small pieces every list draws its cells from — a table row and the phone card beside it alike — so an empty
// value, or a day, looks the same on every list the farm keeps.

/** A cell with nothing in it: a quiet dash, so an empty column reads as nothing written rather than as a gap. */
export const Nothing = () => <span className="text-muted-foreground">—</span>;

/** A farm day as the store keeps it, which is read as that day on the farm rather than as an instant. */
const FARM_DAY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * A moment or a day, in the reader's own calendar — or the dash when there is none.
 *
 * A farm day (`YYYY-MM-DD`: a Lot's Expiry, a Venture's decide-by) is read as that day on the farm; anything else is
 * an instant, said as the farm's clock tells it.
 */
export const SaidDate = ({
  at,
  withTime = false,
}: {
  /** An instant as a Date, an ISO string or milliseconds; or a farm day as `YYYY-MM-DD`. */
  at: Date | string | number | null | undefined;
  /** The time of day as well, for a moment rather than a day. */
  withTime?: boolean;
}) => {
  const { language } = useLanguage();
  if (at === null || at === undefined || at === "") {
    return <Nothing />;
  }
  const isFarmDay = typeof at === "string" && FARM_DAY.test(at);
  const when = isFarmDay ? startOfFarmDay(at) : new Date(at);
  return <>{formatDate(when, language, withTime ? "dateTime" : "date")}</>;
};

/** An entry the farm has retired: kept for what was done under it, and chosen for nothing new. Said by the list's own
 *  word where it has one — a notifiable disease is "off the list". */
export const RetiredBadge = ({ word }: { word?: MessageKey }) => {
  const { t } = useLanguage();
  return (
    <StatusBadge icon={Archive} tone="neutral">
      {t(word ?? "common.retired")}
    </StatusBadge>
  );
};

/** A list's retired entries after the ones in use, whichever way the column is sorted by standing. */
export const retiredLast = (row: { retiredAt: unknown }): number =>
  row.retiredAt ? 1 : 0;

/** How an entry's name reads: quieter once it is retired. */
export const nameTone = (row: { retiredAt: unknown }): string =>
  row.retiredAt ? "text-muted-foreground" : "font-medium";

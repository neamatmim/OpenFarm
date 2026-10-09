import { formatDate } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import type { QueryObserverResult } from "@tanstack/react-query";

import { useLanguage } from "@/i18n/language-provider";
import { useOnline } from "@/lib/online";

/** The read's original timestamp survives putting the query away and restoring it offline. */
export type FreshnessRead = Pick<
  QueryObserverResult,
  "dataUpdatedAt" | "fetchStatus" | "isError"
>;

/** When this page last heard from the farm, independently of whether the phone has sent its own work.
 *  A page made of several reads names its oldest answer, rather than suggesting all of it is as fresh as the newest.
 *  For server reads only: a local optimistic edit is not a new answer from the farm. */
export const DataFreshness = ({ reads }: { reads: FreshnessRead[] }) => {
  const { t, language } = useLanguage();
  const online = useOnline();
  const times = reads
    .map((read) => read.dataUpdatedAt)
    .filter((at) => at > 0 && Number.isFinite(at));
  const at = times.length > 0 ? new Date(Math.min(...times)) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return null;
  }
  const updated = t("common.dataUpdated", {
    at: formatDate(at, language, "dateTime"),
  });
  const failed = reads.some((read) => read.isError);
  const refreshing = reads.some((read) => read.fetchStatus === "fetching");
  let label = updated;
  if (!online) {
    label = t("common.dataOffline", { updated });
  } else if (refreshing) {
    label = t("common.dataRefreshing", { updated });
  } else if (failed) {
    label = t("common.dataRefreshFailed", { updated });
  } else if (times.length !== reads.length) {
    label = t("common.dataIncomplete", { updated });
  }
  return (
    <span
      aria-live="polite"
      className={cn(
        "block text-xs",
        !online || failed ? "text-warning" : "text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
};

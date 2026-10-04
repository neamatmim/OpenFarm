import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import {
  CowsSinceCalving,
  FertilityByMonth,
  FertilityFigures,
} from "@/components/fertility/fertility";
import { Notice, Page, PageHeader } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/**
 * How quickly the farm's cows get back in calf: the year's calving interval, days open, calving to first service, the
 * share of Attempts that took and age at first calving against what DLS asks; the same month by month; and each cow
 * since she last calved, the longest open first. For those who breed the herd — the Owner, the Manager and the Vet.
 */
const FertilityPage = () => {
  const { t } = useLanguage();
  const fertility = useQuery(orpc.breeding.fertility.queryOptions());
  const header = (
    <PageHeader
      description={t("fertility.subtitle")}
      title={t("nav.fertility")}
    />
  );
  if (!fertility.data) {
    return (
      <Page>
        {header}
        {fertility.isError ? (
          <Notice title={t("common.loadFailed")} tone="danger" />
        ) : (
          <>
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </>
        )}
      </Page>
    );
  }
  return (
    <Page>
      {header}
      <FertilityFigures year={fertility.data.year} />
      <CowsSinceCalving cows={fertility.data.cows} />
      <FertilityByMonth months={fertility.data.months} />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/fertility")({
  beforeLoad: onlyFor("vetOrRunsTheFarm", { visitors: false }),
  component: FertilityPage,
});

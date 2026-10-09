import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { Notice, Page } from "@/components/page";
import { useVentureMonth } from "@/components/ventures/venture-month";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";

/**
 * A Venture's months, as its page's «মাসিক প্রতিবেদন» opens them: the farm says which is its latest — this month while
 * it runs, the month of its last money once it has settled or been called off — and the page goes there.
 */
const LatestMonth = () => {
  const { t } = useLanguage();
  const { ventureId } = Route.useParams();
  const navigate = useNavigate();
  const latest = useVentureMonth(ventureId);
  const month = latest.data?.month;
  useEffect(() => {
    if (month) {
      void navigate({
        params: { ventureId, month },
        replace: true,
        to: "/ventures/$ventureId/months/$month",
      });
    }
  }, [month, navigate, ventureId]);
  return (
    <Page>
      {latest.isError ? (
        <Notice title={t("common.loadFailed")} tone="danger" />
      ) : (
        <Skeleton className="h-96 rounded-xl" />
      )}
    </Page>
  );
};

export const Route = createFileRoute(
  "/_authenticated/ventures/$ventureId_/months/"
)({
  beforeLoad: onlyFor("owner"),
  component: LatestMonth,
});

import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { Loaded, Page } from "@/components/page";
import { useVentureMonth } from "@/components/ventures/venture-month";
import { onlyFor } from "@/lib/guard";

/**
 * A Venture's months, as its page's «মাসিক প্রতিবেদন» opens them: the farm says which is its latest — this month while
 * it runs, the month of its last money once it has settled or been called off — and the page goes there.
 */
const LatestMonth = () => {
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
  // The month's place held until the page goes there — or, if the farm could not say which, why, with a way to ask
  // again.
  const placeholder = <Skeleton aria-hidden className="h-96 rounded-xl" />;
  return (
    <Page>
      <Loaded query={latest} skeleton={placeholder}>
        {placeholder}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute(
  "/_authenticated/ventures/$ventureId_/months/"
)({
  beforeLoad: onlyFor("owner"),
  component: LatestMonth,
});

import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, ShoppingCart, Store, Truck } from "lucide-react";
import { useState } from "react";

import { SellingTripForm } from "@/components/fattening/selling-trip";
import { BuyingTripSheet } from "@/components/intake/buying-trip";
import { EmptyState, Loaded, Page, PageHeader } from "@/components/page";
import { PageTabs } from "@/components/page-kit";
import { PastOutings } from "@/components/trips/past-outings";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { TAB_SWITCH } from "@/lib/path-tabs";
import { orpc } from "@/utils/orpc";

const TABS = ["buying", "selling"] as const;
type Tab = (typeof TABS)[number];

/** The address for a tab: the first tab is the page itself, and says nothing. */
const tabSearch = (value: Tab) => (value === "buying" ? {} : { tab: value });

/**
 * Every outing to a livestock market in one place: the Buying Trips, with a way to write one up on its own — the day
 * the lorry came home empty has no arrival to write it up from — and the Selling Trips, as the Sale page has them.
 */
const TripsPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab = "buying" } = Route.useSearch();
  const [writing, setWriting] = useState(false);
  const buying = useQuery(orpc.buyingTrips.list.queryOptions());

  return (
    <Page>
      <PageHeader
        actions={
          <Button onClick={() => setWriting(true)} type="button">
            <Plus aria-hidden data-icon="inline-start" />
            {t("trips.newBuying")}
          </Button>
        }
        description={t("trips.subtitle")}
        title={t("nav.trips")}
      />

      <PageTabs
        onChange={(value) =>
          navigate({ ...TAB_SWITCH, search: tabSearch(value) })
        }
        tabs={[
          {
            value: "buying",
            label: t("trips.buying"),
            icon: ShoppingCart,
            content: (
              <Loaded
                query={buying}
                skeleton={<Skeleton className="h-40 rounded-xl" />}
              >
                {(buying.data ?? []).length === 0 ? (
                  <EmptyState icon={Truck} title={t("trips.noneBuying")} />
                ) : (
                  <PastOutings />
                )}
              </Loaded>
            ),
          },
          {
            value: "selling",
            label: t("trips.selling"),
            icon: Store,
            content: <SellingTripForm />,
          },
        ]}
        value={tab}
      />

      <BuyingTripSheet onOpenChange={setWriting} open={writing} />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/trips")({
  /** For those who run the farm: the Owner and the Farm Managers, who go to the livestock market. */
  beforeLoad: onlyFor("runsTheFarm"),
  component: TripsPage,
  /** Which tab, kept in the address so the page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    search.tab === "selling" ? { tab: "selling" as const } : {},
});

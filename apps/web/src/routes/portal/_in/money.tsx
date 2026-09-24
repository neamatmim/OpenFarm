import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { InvestorMoney } from "@/components/investors/investor-agreements";
import { Loaded, Page, PageHeader } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/**
 * Every taka of theirs that moved — capital in, capital sent back, payouts — a place of its own in the portal, as
 * investor portals keep their transactions: what somebody opens after a payout to see it arrived.
 */
const PortalMoney = () => {
  const { t } = useLanguage();
  const theirs = useQuery(orpc.portal.portfolio.queryOptions());
  return (
    <Page>
      <PageHeader
        description={t("portal.money.hint")}
        title={t("portal.moneyTitle")}
      />
      <Loaded
        query={theirs}
        skeleton={<Skeleton className="h-40 rounded-xl" />}
      >
        {theirs.data ? (
          <InvestorMoney
            agreements={theirs.data.agreements}
            inThePortal
            movements={theirs.data.movements}
          />
        ) : null}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/portal/_in/money")({
  component: PortalMoney,
});

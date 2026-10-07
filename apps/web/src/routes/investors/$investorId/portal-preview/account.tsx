import { createFileRoute } from "@tanstack/react-router";

import { PortalAccount } from "@/components/portal/pages/account";
import { accountSearch } from "@/components/portal/pages/page-search";

/** The Investor's account page as they would read it, its acts dim. */
const TheirAccountSeen = () => {
  const { tab } = Route.useSearch();
  return <PortalAccount tab={tab} />;
};

export const Route = createFileRoute(
  "/investors/$investorId/portal-preview/account"
)({ component: TheirAccountSeen, validateSearch: accountSearch });

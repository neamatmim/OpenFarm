import { createFileRoute } from "@tanstack/react-router";

import {
  PortalAccount,
  accountSearch,
} from "@/components/portal/pages/account";

/** The Investor's account page as they would read it, its acts dim. */
const TheirAccountSeen = () => {
  const { tab } = Route.useSearch();
  return <PortalAccount tab={tab} />;
};

export const Route = createFileRoute(
  "/investors/$investorId/as-they-see-it/account"
)({ component: TheirAccountSeen, validateSearch: accountSearch });

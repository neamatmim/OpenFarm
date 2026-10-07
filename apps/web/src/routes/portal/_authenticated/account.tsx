import { createFileRoute } from "@tanstack/react-router";

import { PortalAccount } from "@/components/portal/pages/account";
import { accountSearch } from "@/components/portal/pages/page-search";

/** An Investor's own account, in their own portal. */
const TheirAccount = () => {
  const { tab } = Route.useSearch();
  return <PortalAccount tab={tab} />;
};

export const Route = createFileRoute("/portal/_authenticated/account")({
  component: TheirAccount,
  validateSearch: accountSearch,
});

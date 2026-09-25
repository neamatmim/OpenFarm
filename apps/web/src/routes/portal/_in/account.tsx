import { createFileRoute } from "@tanstack/react-router";

import {
  PortalAccount,
  accountSearch,
} from "@/components/portal/pages/account";

/** An Investor's own account, in their own portal. */
const TheirAccount = () => {
  const { tab } = Route.useSearch();
  return <PortalAccount tab={tab} />;
};

export const Route = createFileRoute("/portal/_in/account")({
  component: TheirAccount,
  validateSearch: accountSearch,
});

import { createFileRoute } from "@tanstack/react-router";

import {
  PortalVenture,
  ventureSearch,
} from "@/components/portal/pages/venture";

/** One Venture an Investor is in, in their own portal. */
const TheirVenture = () => {
  const { agreementId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <PortalVenture agreementId={agreementId} tab={tab} />;
};

export const Route = createFileRoute(
  "/portal/_authenticated/agreements/$agreementId"
)({
  component: TheirVenture,
  validateSearch: ventureSearch,
});

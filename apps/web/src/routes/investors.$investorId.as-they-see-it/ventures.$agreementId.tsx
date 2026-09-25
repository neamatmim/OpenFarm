import { createFileRoute } from "@tanstack/react-router";

import {
  PortalVenture,
  ventureSearch,
} from "@/components/portal/pages/venture";

/** One of the Investor's Ventures as they would read it. */
const TheirVentureSeen = () => {
  const { agreementId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <PortalVenture agreementId={agreementId} tab={tab} />;
};

export const Route = createFileRoute(
  "/investors/$investorId/as-they-see-it/ventures/$agreementId"
)({ component: TheirVentureSeen, validateSearch: ventureSearch });

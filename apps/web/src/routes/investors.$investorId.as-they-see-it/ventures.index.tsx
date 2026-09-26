import { createFileRoute } from "@tanstack/react-router";

import {
  PortalYourVentures,
  yourVenturesSearch,
} from "@/components/portal/pages/your-ventures";

/** Every Venture the Investor is in or has been in, as they would read it. */
const TheirVenturesSeen = () => {
  const { tab } = Route.useSearch();
  return <PortalYourVentures tab={tab} />;
};

export const Route = createFileRoute(
  "/investors/$investorId/as-they-see-it/ventures/"
)({ component: TheirVenturesSeen, validateSearch: yourVenturesSearch });

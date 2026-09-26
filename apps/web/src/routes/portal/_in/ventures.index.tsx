import { createFileRoute } from "@tanstack/react-router";

import {
  PortalYourVentures,
  yourVenturesSearch,
} from "@/components/portal/pages/your-ventures";

/** Every Venture an Investor is in or has been in, in their own portal. */
const TheirVentures = () => {
  const { tab } = Route.useSearch();
  return <PortalYourVentures tab={tab} />;
};

export const Route = createFileRoute("/portal/_in/ventures/")({
  component: TheirVentures,
  validateSearch: yourVenturesSearch,
});

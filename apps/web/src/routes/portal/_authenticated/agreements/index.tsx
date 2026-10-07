import { createFileRoute } from "@tanstack/react-router";

import { yourVenturesSearch } from "@/components/portal/pages/page-search";
import { PortalYourVentures } from "@/components/portal/pages/your-ventures";

/** Every Venture an Investor is in or has been in, in their own portal. */
const TheirVentures = () => {
  const { tab } = Route.useSearch();
  return <PortalYourVentures tab={tab} />;
};

export const Route = createFileRoute("/portal/_authenticated/agreements/")({
  component: TheirVentures,
  validateSearch: yourVenturesSearch,
});

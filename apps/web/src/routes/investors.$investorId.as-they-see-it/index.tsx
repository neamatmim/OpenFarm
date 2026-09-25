import { createFileRoute } from "@tanstack/react-router";

import { PortalHome } from "@/components/portal/pages/home";

export const Route = createFileRoute("/investors/$investorId/as-they-see-it/")({
  component: PortalHome,
});

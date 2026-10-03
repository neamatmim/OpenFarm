import { createFileRoute } from "@tanstack/react-router";

import { PortalRequestsPage } from "@/components/portal/requests-to-join";

export const Route = createFileRoute("/portal/_authenticated/requests")({
  component: PortalRequestsPage,
});

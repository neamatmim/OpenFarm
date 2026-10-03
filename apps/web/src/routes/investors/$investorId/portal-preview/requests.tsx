import { createFileRoute } from "@tanstack/react-router";

import { PortalRequestsPage } from "@/components/portal/requests-to-join";

export const Route = createFileRoute(
  "/investors/$investorId/portal-preview/requests"
)({ component: PortalRequestsPage });

import { createFileRoute } from "@tanstack/react-router";

import { PortalMoney } from "@/components/portal/pages/money";

export const Route = createFileRoute(
  "/investors/$investorId/portal-preview/money"
)({ component: PortalMoney });

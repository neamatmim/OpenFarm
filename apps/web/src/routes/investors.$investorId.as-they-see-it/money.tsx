import { createFileRoute } from "@tanstack/react-router";

import { PortalMoney } from "@/components/portal/pages/money";

export const Route = createFileRoute(
  "/investors/$investorId/as-they-see-it/money"
)({ component: PortalMoney });

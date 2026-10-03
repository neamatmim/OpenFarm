import { createFileRoute } from "@tanstack/react-router";

import { PortalMoney } from "@/components/portal/pages/money";

export const Route = createFileRoute("/portal/_authenticated/money")({
  component: PortalMoney,
});

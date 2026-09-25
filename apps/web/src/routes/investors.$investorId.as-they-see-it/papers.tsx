import { createFileRoute } from "@tanstack/react-router";

import { PortalPapersPage } from "@/components/portal/pages/papers";

export const Route = createFileRoute(
  "/investors/$investorId/as-they-see-it/papers"
)({ component: PortalPapersPage });

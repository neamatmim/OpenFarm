import { createFileRoute } from "@tanstack/react-router";

import { OpenVenturesPage } from "@/components/portal/pages/open-ventures";

export const Route = createFileRoute(
  "/investors/$investorId/as-they-see-it/open/"
)({ component: OpenVenturesPage });

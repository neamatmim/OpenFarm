import { createFileRoute } from "@tanstack/react-router";

import { YourData } from "@/components/portal/pages/your-data";

export const Route = createFileRoute(
  "/investors/$investorId/as-they-see-it/your-data"
)({ component: YourData });

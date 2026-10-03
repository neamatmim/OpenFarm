import { createFileRoute } from "@tanstack/react-router";

import { PortalPapersPage } from "@/components/portal/pages/papers";

export const Route = createFileRoute("/portal/_authenticated/papers")({
  component: PortalPapersPage,
});

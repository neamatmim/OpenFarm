import { createFileRoute } from "@tanstack/react-router";

import { PortalHome } from "@/components/portal/pages/home";

export const Route = createFileRoute("/portal/_authenticated/")({
  component: PortalHome,
});

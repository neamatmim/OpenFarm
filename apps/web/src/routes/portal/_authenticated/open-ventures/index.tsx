import { createFileRoute } from "@tanstack/react-router";

import { OpenVenturesPage } from "@/components/portal/pages/open-ventures";

export const Route = createFileRoute("/portal/_authenticated/open-ventures/")({
  component: OpenVenturesPage,
});

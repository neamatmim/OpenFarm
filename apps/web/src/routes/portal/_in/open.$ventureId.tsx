import { createFileRoute } from "@tanstack/react-router";

import { OpenVenturePage } from "@/components/portal/pages/open-venture";

/** One Venture the farm is raising capital for, in an Investor's own portal. */
const TheOpenVenture = () => {
  const { ventureId } = Route.useParams();
  return <OpenVenturePage ventureId={ventureId} />;
};

export const Route = createFileRoute("/portal/_in/open/$ventureId")({
  component: TheOpenVenture,
});

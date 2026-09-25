import { createFileRoute } from "@tanstack/react-router";

import { OpenVenturePage } from "@/components/portal/pages/open-venture";

/** A Venture raising capital as the Investor would read it, their Request's acts dim. */
const TheOpenVentureSeen = () => {
  const { ventureId } = Route.useParams();
  return <OpenVenturePage ventureId={ventureId} />;
};

export const Route = createFileRoute(
  "/investors/$investorId/as-they-see-it/open/$ventureId"
)({ component: TheOpenVentureSeen });

import { createFileRoute } from "@tanstack/react-router";

import { Page } from "@/components/page";
import { YourData } from "@/components/portal/pages/your-data";

/** «আপনার তথ্য» as their portal shows it, set in a page like every other one of theirs. */
const YourDataSeen = () => (
  <Page>
    <YourData />
  </Page>
);

export const Route = createFileRoute(
  "/investors/$investorId/as-they-see-it/your-data"
)({ component: YourDataSeen });

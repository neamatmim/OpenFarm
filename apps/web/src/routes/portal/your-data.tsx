import { createFileRoute } from "@tanstack/react-router";

import { YourData } from "@/components/portal/pages/your-data";
import { PortalDoor } from "@/components/portal/portal-door";

/** «আপনার তথ্য» at the portal's door: readable before anybody signs in, and after. */
const YourDataPage = () => (
  <PortalDoor wide>
    <YourData />
  </PortalDoor>
);

export const Route = createFileRoute("/portal/your-data")({
  component: YourDataPage,
});

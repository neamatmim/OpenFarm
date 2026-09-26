import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Page } from "@/components/page";
import { YourData } from "@/components/portal/pages/your-data";
import { PortalDoor } from "@/components/portal/portal-door";
import { PortalShell } from "@/components/portal/portal-shell";
import { orpc } from "@/utils/orpc";

/**
 * «আপনার তথ্য», readable before anybody signs in and after: at the portal's door for somebody who has not, and inside
 * the portal for an Investor who has, so reading it does not take them out of their own pages.
 */
const YourDataPage = () => {
  const signedIn = useQuery({ ...orpc.portal.me.queryOptions(), retry: false });
  if (signedIn.data) {
    return (
      <PortalShell>
        <Page>
          <YourData />
        </Page>
      </PortalShell>
    );
  }
  return (
    <PortalDoor wide>
      <YourData />
    </PortalDoor>
  );
};

export const Route = createFileRoute("/portal/your-data")({
  component: YourDataPage,
});

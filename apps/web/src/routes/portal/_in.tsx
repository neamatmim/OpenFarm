import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { PortalShell } from "@/components/portal/portal-shell";
import { getUser } from "@/functions/get-user";
import { forgetWhatThisPhoneRead } from "@/lib/query-cache";
import { wordOf } from "@/lib/saying";

/** The portal an Investor reads their Ventures in (ADR 0007), framed as the farm's own pages are. */
const PortalLayout = () => (
  <PortalShell>
    <Outlet />
  </PortalShell>
);

export const Route = createFileRoute("/portal/_in")({
  ssr: false,
  // Signed in, and as an Investor the farm has let in; anybody else is sent where they belong.
  beforeLoad: async ({ context }) => {
    let session: Awaited<ReturnType<typeof getUser>> = null;
    try {
      session = await getUser();
    } catch {
      throw redirect({ to: "/portal/login" });
    }
    if (!session) {
      throw redirect({ to: "/portal/login" });
    }
    const me = await context.queryClient.fetchQuery({
      ...context.orpc.people.me.queryOptions(),
      staleTime: 0,
    });
    if (!me.investor) {
      throw redirect({ to: "/dashboard" });
    }
    // A sign-in lasts a working day: past it, the portal ends it and they sign in again, told why.
    try {
      await context.queryClient.fetchQuery({
        ...context.orpc.portal.me.queryOptions(),
        staleTime: 0,
      });
    } catch (error) {
      if (wordOf(error) === "signed_in_too_long") {
        // What they read in that day goes with it, in the tab and on the phone.
        await forgetWhatThisPhoneRead(context.queryClient);
        throw redirect({ search: { ended: true }, to: "/portal/login" });
      }
      throw error;
    }
  },
  component: PortalLayout,
});

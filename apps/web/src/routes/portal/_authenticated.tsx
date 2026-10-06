import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { PortalShell } from "@/components/portal/portal-shell";
import { getUser } from "@/functions/get-user";
import { leaveTheEndedSignIn } from "@/lib/ended-sign-in";
import { wordOf } from "@/lib/saying";
import { signOutOfThisPhone } from "@/lib/sign-out";

/** The portal an Investor reads their Ventures in (ADR 0007), framed as the farm's own pages are. */
const PortalLayout = () => (
  <PortalShell>
    <Outlet />
  </PortalShell>
);

export const Route = createFileRoute("/portal/_authenticated")({
  ssr: false,
  // Signed in, and as an Investor the farm has let in; anybody else is sent where they belong.
  beforeLoad: async ({ context }) => {
    let session: Awaited<ReturnType<typeof getUser>> = null;
    try {
      session = await getUser();
    } catch {
      throw redirect({ to: "/portal/sign-in" });
    }
    if (!session) {
      throw redirect({ to: "/portal/sign-in" });
    }
    const me = await context.queryClient.fetchQuery({
      ...context.orpc.people.me.queryOptions(),
      staleTime: 0,
    });
    if (!me.investor) {
      throw redirect({ to: "/" });
    }
    // A sign-in lasts a working day: past it, the portal ends it and they sign in again, told why.
    try {
      await context.queryClient.fetchQuery({
        ...context.orpc.portal.me.queryOptions(),
        staleTime: 0,
      });
    } catch (error) {
      if (wordOf(error) === "signed_in_too_long") {
        // What they read in that day goes with it (lib/ended-sign-in).
        await leaveTheEndedSignIn(context.queryClient);
        throw redirect({ search: { ended: true }, to: "/portal/sign-in" });
      }
      // The Owner shut the portal, or took their access away, while they were in: signed out of this phone and told
      // so at the door — never left on an error page that leads only back to itself. Signed out first, or the door
      // would send a signed-in reader straight back here.
      if (wordOf(error) === "not_an_investor") {
        await signOutOfThisPhone(context.queryClient);
        throw redirect({ search: { closed: true }, to: "/portal/sign-in" });
      }
      throw error;
    }
  },
  component: PortalLayout,
});

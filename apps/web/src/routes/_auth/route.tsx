import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { SyncBanner } from "@/components/sync-banner";
import { getUser } from "@/functions/get-user";
import { installShell, keepStorage } from "@/lib/install";

/**
 * Every screen behind a sign-in carries the banner: what this phone is still holding, and
 * how long the farm has been without it. The question in the barn is always that one, so it
 * is never more than a glance away.
 */
const AuthLayout = () => {
  useEffect(() => {
    // Asked once the person is signed in, which is when a barn phone starts holding work
    // that only exists here.
    const prepare = async () => {
      await installShell();
      await keepStorage();
    };
    prepare();
  }, []);

  return (
    <>
      <SyncBanner />
      <Outlet />
    </>
  );
};

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
  // Drawn in the browser alone. Everything behind sign-in works from what this phone has kept (the query cache on
  // the device), which the server has never seen: a page it rendered never matches the one the browser draws, so
  // React throws it away and cancels the requests it had begun. The public pages are still rendered on the server.
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const known = context.queryClient.getQueryData(
      context.orpc.people.me.queryKey()
    );
    let session: Awaited<ReturnType<typeof getUser>> = null;
    try {
      session = await getUser();
    } catch {
      // No signal. A phone that cannot ask who is signed in is not a phone that has been
      // signed out — and sending a milker to the login screen mid-shift, with a morning's
      // work in the Outbox, would be the worst answer available.
      if (known) {
        return { session: null, me: known };
      }
      throw redirect({ to: "/login" });
    }
    if (!session) {
      throw redirect({ to: "/login" });
    }
    // A remembered answer is trusted for a person with a farm — that is what keeps a milker working through a
    // dropped signal. One that says there is no farm yet is asked again: the farm may have been set up since,
    // and trusting it would hold the new Owner on the setup screen for ever.
    const me: NonNullable<typeof known> = known?.farm
      ? known
      : await context.queryClient.fetchQuery({
          ...context.orpc.people.me.queryOptions(),
          staleTime: 0,
        });
    if (!me.farm && location.pathname !== "/setup") {
      throw redirect({ to: "/setup" });
    }
    return { session, me };
  },
});

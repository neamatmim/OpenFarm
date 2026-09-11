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
    const me: NonNullable<typeof known> =
      known ??
      (await context.queryClient.ensureQueryData(
        context.orpc.people.me.queryOptions()
      ));
    if (!me.farm && location.pathname !== "/setup") {
      throw redirect({ to: "/setup" });
    }
    return { session, me };
  },
});

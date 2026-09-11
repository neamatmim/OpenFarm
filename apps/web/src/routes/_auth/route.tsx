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
    const session = await getUser();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    const me = await context.queryClient.ensureQueryData(
      context.orpc.people.me.queryOptions()
    );
    if (!me.farm && location.pathname !== "/setup") {
      throw redirect({ to: "/setup" });
    }
    return { session, me };
  },
});

import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { getUser } from "@/functions/get-user";
import {
  getActiveUser,
  getAutoLockMinutes,
  getDeviceToken,
  isLocked,
  setSignedInPerson,
} from "@/lib/device";
import { installShell, keepStorage } from "@/lib/install";

/**
 * Every screen behind a sign-in sits in the app shell: the farm's menu, and — in its top bar — what this phone is
 * still holding and how long the farm has been without it. The question in the barn is always that one, so it is
 * never more than a glance away.
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
    <AppShell>
      <Outlet />
    </AppShell>
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
    // A Shed Phone has no personal sign-in: it works as whoever is PIN-switched in, and a locked phone goes back to
    // its PIN screen rather than to a login it has no account for (ADR 0003).
    if (getDeviceToken()) {
      const active = getActiveUser();
      if (isLocked(active, getAutoLockMinutes())) {
        throw redirect({ to: "/device" });
      }
      if (known && known.id === active?.userId) {
        return { session: null, me: known };
      }
      try {
        const me = await context.queryClient.fetchQuery({
          ...context.orpc.people.me.queryOptions(),
          staleTime: 0,
        });
        return { session: null, me };
      } catch {
        // No signal and nothing read for this person yet: the phone still holds their work, but it has no screen
        // to show until the farm has said who they are.
        throw redirect({ to: "/device" });
      }
    }
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
    // On a farm that exists, a person holding no Role has an invite to take up with its code — or none, and nothing
    // here to do until somebody gives them one.
    if (me.farm && me.roles.length === 0 && location.pathname !== "/join") {
      throw redirect({ to: "/join" });
    }
    setSignedInPerson(me.id);
    return { session, me };
  },
});

import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { PasswordAgainDialog } from "@/components/password-again-dialog";
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
import { keepThisBuild } from "@/lib/keep-the-build";
import { phoneOutbox } from "@/lib/outbox-client";
import { whoTheyAre } from "@/lib/who-they-are";

/** How long the farm's answer about who somebody is stands before it is asked again. Long enough that moving
 *  between screens does not ask on every one; short enough that access taken away stops letting them in. */
const WHO_THEY_ARE_FRESH_MS = 60_000;

/**
 * Every screen behind a sign-in sits in the app shell: the farm's menu, and — in its top bar — what this phone is
 * still holding and how long the farm has been without it. The question in the barn is always that one, so it is
 * never more than a glance away.
 */
const AuthLayout = () => {
  const router = useRouter();
  useEffect(() => {
    // Asked once the person is signed in, which is when a barn phone starts holding work
    // that only exists here.
    const prepare = async () => {
      await installShell();
      await keepStorage();
      // The shed's screens kept on the phone for this build, and older builds' files let go.
      await keepThisBuild(router.ssr?.manifest, router);
    };
    prepare();
  }, [router]);

  // Somebody with an invite still to take up, or a farm still to set up, has nothing on the farm's menus yet: those two
  // pages are doors of their own, drawn as the sign-in is.
  const { pathname } = useLocation();
  if (pathname === "/join" || pathname === "/setup") {
    return <Outlet />;
  }
  return (
    <AppShell>
      <Outlet />
      <PasswordAgainDialog />
    </AppShell>
  );
};

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
  // Drawn in the browser alone. Everything behind sign-in works from what this phone has kept (the query cache on
  // the device), which the server has never seen: a page it rendered never matches the one the browser draws, so
  // React throws it away and cancels the requests it had begun. The public pages are still rendered on the server.
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    // Opened cold with no signal, what the phone last read is the only answer to who this is: it is waited for.
    await context.restored;
    const known = context.queryClient.getQueryData(
      context.orpc.people.me.queryKey()
    );
    // A Shed Phone has no personal sign-in: it works as whoever is PIN-switched in, and a locked phone goes back to
    // its PIN screen rather than to a login it has no account for (ADR 0003).
    if (getDeviceToken()) {
      const active = getActiveUser();
      if (isLocked(active, getAutoLockMinutes())) {
        // Where they were, and who they were, so the same person's PIN takes them back there.
        throw redirect({
          to: "/shed-phone",
          search: { back: location.href, for: active?.userId },
        });
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
        throw redirect({ to: "/shed-phone" });
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
      throw redirect({ to: "/sign-in" });
    }
    if (!session) {
      throw redirect({ to: "/sign-in" });
    }
    // The farm is asked who this is, and its answer wins: Roles taken away, or a farm that is not there any more,
    // would otherwise go on letting them onto screens where every request is refused. A remembered answer stands
    // only when the farm cannot be reached — a dropped signal is not a change of who somebody is — and one asked
    // for within the last minute is not asked for again, so moving between screens does not ask on every one.
    const me = await whoTheyAre({
      known,
      ask: () =>
        context.queryClient.fetchQuery({
          ...context.orpc.people.me.queryOptions(),
          staleTime: WHO_THEY_ARE_FRESH_MS,
        }),
    });
    if (!me) {
      throw redirect({ to: "/sign-in" });
    }
    if (!me.farm && location.pathname !== "/setup") {
      throw redirect({ to: "/setup" });
    }
    // An Investor's account holds no Role and never will: its place is the portal (ADR 0007).
    if (me.investor) {
      throw redirect({ to: "/portal" });
    }
    // On a farm that exists, a person holding no Role has an invite to take up with its code — or none, and nothing
    // here to do until somebody gives them one.
    if (me.farm && me.roles.length === 0 && location.pathname !== "/join") {
      throw redirect({ to: "/join" });
    }
    setSignedInPerson(me.id);
    // Signed in again: whatever the Outbox stopped holding back for want of a session can go, without the person having
    // to find the pill's small retry. A Shed Phone resumes on its PIN instead.
    if (!getDeviceToken()) {
      await phoneOutbox()?.resume();
    }
    return { session, me };
  },
});
